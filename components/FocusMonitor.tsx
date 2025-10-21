import React, { useState, useRef, useEffect, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Student, DistractionEvent, SessionSummaryData } from '../types';
import { useFaceApi } from '../hooks/useFaceApi';
import { useWebcam } from '../hooks/useWebcam';
import ScoreGauge from './ScoreGauge';
import SessionSummaryModal from './SessionSummaryModal';
import { CameraIcon, StopCircleIcon, EyeOffIcon } from './Icons';

// Access face-api.js from the global scope
declare const faceapi: any;

const DETECTION_INTERVAL = 500; // ms

const FocusMonitor: React.FC = () => {
    const [students, setStudents] = useState<Map<number, Student>>(new Map());
    const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
    const [distractionEvents, setDistractionEvents] = useState<DistractionEvent[]>([]);
    const [showSummary, setShowSummary] = useState(false);
    
    const sessionTimeRef = useRef(0);
    const detectionIntervalRef = useRef<number | null>(null);
    const sessionTimerIntervalRef = useRef<number | null>(null);

    const { modelsLoaded, error: modelError } = useFaceApi();
    const { videoRef, isSessionActive, error: webcamError, startSession: startWebcam, stopSession: stopWebcam } = useWebcam();
    
    // More robust EAR calculation
    const getEyeAspectRatio = (eye: any[]): number | null => {
        if (!eye || eye.length !== 6) return null;
        const p1 = eye[0], p2 = eye[1], p3 = eye[2], p4 = eye[3], p5 = eye[4], p6 = eye[5];
        const dist = (p1: any, p2: any) => Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
        const verticalDist = dist(p2, p6) + dist(p3, p5);
        const horizontalDist = dist(p1, p4);
        if (horizontalDist === 0) return null;
        return verticalDist / (2.0 * horizontalDist);
    };

    const calculateFocusScore = (landmarks: any, eyesClosedDuration: number): { score: number; newEyesClosedDuration: number } => {
        if (!landmarks) return { score: 0, newEyesClosedDuration: eyesClosedDuration };

        let score = 100;
        const penalties = { drowsiness: 0, tilt: 0, yaw: 0 };
        let newEyesClosedDuration = eyesClosedDuration;

        const leftEye = landmarks.getLeftEye();
        const rightEye = landmarks.getRightEye();

        // 1. Drowsiness/Eye Gaze Penalty
        const leftEAR = getEyeAspectRatio(leftEye);
        const rightEAR = getEyeAspectRatio(rightEye);
        
        if (leftEAR !== null && rightEAR !== null) {
            const avgEAR = (leftEAR + rightEAR) / 2.0;
            const EYE_AR_THRESH = 0.21; // Threshold for blink/closed
            const EYE_AR_CLOSED_DURATION_MS = 600;

            if (avgEAR < EYE_AR_THRESH) {
                newEyesClosedDuration += DETECTION_INTERVAL;
                if (newEyesClosedDuration > EYE_AR_CLOSED_DURATION_MS) {
                    penalties.drowsiness = Math.min(100, (newEyesClosedDuration - EYE_AR_CLOSED_DURATION_MS) / 40);
                }
            } else {
                newEyesClosedDuration = 0;
            }
        } else {
            penalties.drowsiness = 25; // Apply a penalty if eyes can't be seen
        }

        // 2. Head Tilt (Roll) Penalty
        if (leftEye && rightEye && leftEye.length === 6 && rightEye.length === 6) {
            const eyeAngle = Math.atan2(rightEye[3].y - leftEye[0].y, rightEye[3].x - leftEye[0].x) * (180 / Math.PI);
            const TILT_THRESH = 15; // degrees
            if (Math.abs(eyeAngle) > TILT_THRESH) {
                penalties.tilt = Math.min(50, (Math.abs(eyeAngle) - TILT_THRESH) * 2); // Less harsh penalty
            }
        }

        // 3. Head Turn (Yaw) Penalty
        const jaw = landmarks.getJawOutline();
        const nose = landmarks.getNose();
        if (jaw && nose && jaw.length > 2) {
            const jawLeft = jaw[0];
            const jawRight = jaw[jaw.length - 1];
            const noseTip = nose[3];
            const distLeft = Math.abs(jawLeft.x - noseTip.x);
            const distRight = Math.abs(jawRight.x - noseTip.x);
            
            if (distLeft > 0 && distRight > 0) {
                const ratio = Math.max(distLeft, distRight) / Math.min(distLeft, distRight);
                const YAW_THRESH = 1.7; // If one side is 70% larger than the other
                if (ratio > YAW_THRESH) {
                    penalties.yaw = Math.min(80, (ratio - YAW_THRESH) * 50); // Severe penalty for turning away
                }
            }
        }

        score = score - penalties.drowsiness - penalties.tilt - penalties.yaw;
        return { score: Math.round(Math.max(0, Math.min(100, score))), newEyesClosedDuration };
    };

    const runDetection = useCallback(async () => {
        if (videoRef.current && videoRef.current.readyState >= 3) {
            const detections = await faceapi.detectAllFaces(videoRef.current, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks();
            
            setStudents(prevStudents => {
                const nextStudents = new Map(prevStudents);
                 detections.forEach((d: any, index: number) => {
                    const id = index + 1;
                    const existingStudent = prevStudents.get(id);

                    const { score, newEyesClosedDuration } = calculateFocusScore(
                        d.landmarks,
                        existingStudent?.eyesClosedDuration ?? 0
                    );
                    
                    const history = existingStudent?.focusHistory ?? [];
                    const newHistory = [...history, { time: sessionTimeRef.current, score }];

                    const updatedStudent: Student = {
                        id,
                        box: d.detection.box,
                        focusScore: score,
                        lastBlink: existingStudent?.lastBlink ?? Date.now(),
                        eyesClosedDuration: newEyesClosedDuration,
                        focusHistory: newHistory.length > 200 ? newHistory.slice(-200) : newHistory,
                        averageFocus: newHistory.length > 0 ? Math.round(newHistory.reduce((acc, p) => acc + p.score, 0) / newHistory.length) : 0,
                    };

                    if (score < 40 && (existingStudent?.focusScore ?? 100) >= 40) {
                        setDistractionEvents(prev => [...prev, { time: sessionTimeRef.current, studentId: id, studentName: `Student ${id}` }]);
                    }
                    nextStudents.set(id, updatedStudent);
                });
                
                // Remove students who are no longer detected
                const detectedIds = new Set(detections.map((_:any, i:number) => i + 1));
                for (const id of nextStudents.keys()) {
                    if (!detectedIds.has(id)) {
                        nextStudents.delete(id);
                    }
                }
                
                return nextStudents;
            });
        }
    }, [videoRef]);

    const startSession = async () => {
        setSelectedStudentId(null);
        setStudents(new Map());
        sessionTimeRef.current = 0;
        setDistractionEvents([]);
        setShowSummary(false);
        await startWebcam();
    };
    
    const stopSession = () => {
        if (sessionTimeRef.current > 0) {
            setShowSummary(true);
        }
        stopWebcam();
    };

    useEffect(() => {
        if (isSessionActive) {
            detectionIntervalRef.current = window.setInterval(runDetection, DETECTION_INTERVAL);
            sessionTimerIntervalRef.current = window.setInterval(() => {
                sessionTimeRef.current += 1;
            }, 1000);
        } else {
            if (detectionIntervalRef.current) clearInterval(detectionIntervalRef.current);
            if (sessionTimerIntervalRef.current) clearInterval(sessionTimerIntervalRef.current);
        }
        return () => {
            if (detectionIntervalRef.current) clearInterval(detectionIntervalRef.current);
            if (sessionTimerIntervalRef.current) clearInterval(sessionTimerIntervalRef.current);
        };
    }, [isSessionActive, runDetection]);


    // This effect is ONLY for re-rendering the timer on screen.
    const [, setTick] = useState(0);
    useEffect(() => {
        if (isSessionActive) {
            const rerenderTimer = setInterval(() => setTick(t => t + 1), 1000);
            return () => clearInterval(rerenderTimer);
        }
    }, [isSessionActive]);
    
    const closeSummaryAndReset = () => {
        setShowSummary(false);
        setStudents(new Map());
        sessionTimeRef.current = 0;
        setDistractionEvents([]);
        setSelectedStudentId(null);
    };

    const studentsArray = Array.from(students.values());
    const classAverage = studentsArray.length > 0 ? Math.round(studentsArray.reduce((acc, s) => acc + s.focusScore, 0) / studentsArray.length) : 0;
    const sessionClassAverage = studentsArray.length > 0 ? Math.round(studentsArray.reduce((acc, s) => acc + s.averageFocus, 0) / studentsArray.length) : 0;

    const selectedStudent = selectedStudentId ? students.get(selectedStudentId) : null;
    
    const getDisplayData = () => {
        if (selectedStudent) {
            return selectedStudent;
        }

        const combinedHistory = new Map<number, number[]>();
         studentsArray.forEach(s => s.focusHistory.forEach(p => {
             if(!combinedHistory.has(p.time)) combinedHistory.set(p.time, []);
             combinedHistory.get(p.time)!.push(p.score);
         }));
        
        const aggregatedHistory = Array.from(combinedHistory.entries()).map(([time, scores]) => ({
             time,
             score: Math.round(scores.reduce((a,b) => a+b, 0) / scores.length)
         })).sort((a,b) => a.time - b.time);

        return {
            focusScore: classAverage,
            averageFocus: sessionClassAverage,
            focusHistory: aggregatedHistory,
        };
    };
    
    const displayData = getDisplayData();
    
    const formatTime = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
    const getLoadingMessage = () => !modelsLoaded ? "Loading AI Models..." : "Starting Webcam...";
    const mainLabel = selectedStudentId ? `Student ${selectedStudentId}` : (students.size > 1 ? 'Class' : 'Your');
    const isLoading = !modelsLoaded || (isSessionActive && !videoRef.current?.srcObject);

    const sessionSummaryData: SessionSummaryData = {
        duration: sessionTimeRef.current,
        overallAverage: sessionClassAverage,
        students: studentsArray,
        events: distractionEvents,
    };
    
    return (
        <div className="bg-slate-800 rounded-xl p-4 sm:p-6 shadow-2xl flex flex-col gap-6">
            {showSummary && <SessionSummaryModal data={sessionSummaryData} onClose={closeSummaryAndReset} formatTime={formatTime}/>}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                <div className="lg:col-span-3 flex flex-col gap-4">
                    <div className="relative aspect-video bg-slate-900 rounded-lg overflow-hidden shadow-inner">
                        <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover transform -scale-x-100"></video>
                        {isSessionActive && videoRef.current?.videoHeight && studentsArray.map(student => (
                            <div
                                key={student.id}
                                className={`absolute rounded-md pointer-events-auto cursor-pointer transition-all duration-300 ${selectedStudentId === student.id ? 'ring-4 ring-sky-400 ring-offset-2 ring-offset-slate-800' : 'hover:ring-2 hover:ring-sky-500'}`}
                                style={{
                                    top: `${(student.box.y / videoRef.current!.videoHeight) * 100}%`,
                                    left: `${100 - ((student.box.x + student.box.width) / videoRef.current!.videoWidth) * 100}%`,
                                    width: `${(student.box.width / videoRef.current!.videoWidth) * 100}%`,
                                    height: `${(student.box.height / videoRef.current!.videoHeight) * 100}%`,
                                    borderColor: student.focusScore > 70 ? '#2dd4bf' : student.focusScore > 40 ? '#facc15' : '#f87171',
                                    borderWidth: '3px'
                                }}
                                onClick={() => setSelectedStudentId(student.id === selectedStudentId ? null : student.id)}
                            >
                                <div className="absolute -top-7 left-0 bg-black/70 p-1 px-2 rounded">
                                    <p className="font-bold whitespace-nowrap text-center text-xs text-white">
                                        {`Student ${student.id}`}: <span className={student.focusScore > 70 ? 'text-teal-400' : student.focusScore > 40 ? 'text-yellow-400' : 'text-red-400'}>
                                            {student.focusScore}%
                                        </span>
                                    </p>
                                </div>
                            </div>
                        ))}
                        {!isSessionActive && (
                            <div className="absolute inset-0 bg-black bg-opacity-60 flex flex-col justify-center items-center text-center p-4">
                               {isLoading ? (
                                    <>
                                        <svg className="animate-spin h-10 w-10 text-sky-400 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        <h3 className="font-semibold text-lg">{getLoadingMessage()}</h3>
                                    </>
                               ) : (
                                <>
                                    <CameraIcon className="w-12 h-12 text-slate-400 mb-4" />
                                    <h3 className="font-semibold text-lg">Webcam Preview</h3>
                                    <p className="text-sm text-slate-300">Start the session to begin monitoring.</p>
                                </>
                               )}
                            </div>
                        )}
                    </div>
                    {(webcamError || modelError) && <p className="text-red-400 text-sm text-center">{webcamError || modelError}</p>}
                    {!isSessionActive ? (
                        <button onClick={startSession} disabled={!modelsLoaded} className="w-full flex justify-center items-center gap-2 bg-sky-500 hover:bg-sky-600 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition duration-300 shadow-lg">
                            <CameraIcon className="w-6 h-6" /> Start Monitoring Session
                        </button>
                    ) : (
                        <button onClick={stopSession} className="w-full flex justify-center items-center gap-2 bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-4 rounded-lg transition duration-300 shadow-lg">
                            <StopCircleIcon className="w-6 h-6" /> End Session & View Summary
                        </button>
                    )}
                </div>
                <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-slate-700/50 rounded-lg p-4 flex flex-col items-center justify-center text-center">
                        <h3 className="text-lg font-semibold text-slate-300 mb-2">{mainLabel} Focus</h3>
                        <ScoreGauge score={displayData.focusScore} />
                    </div>
                    <div className="bg-slate-700/50 rounded-lg p-4 flex flex-col items-center justify-center text-center">
                        <h3 className="text-lg font-semibold text-slate-300 mb-2">Session Score</h3>
                        <p className="text-6xl font-bold text-sky-400">{isSessionActive || students.size > 0 ? displayData.averageFocus : '-'}</p>
                        <p className="text-slate-400">{mainLabel} Average</p>
                    </div>
                     <div className="bg-slate-700/50 rounded-lg p-4 flex flex-col items-center justify-center text-center">
                        <h3 className="text-lg font-semibold text-slate-300 mb-2">Session Timer</h3>
                        <p className="text-6xl font-bold text-teal-400">{formatTime(sessionTimeRef.current)}</p>
                        <p className="text-slate-400">Elapsed Time</p>
                    </div>
                </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-slate-700/50 rounded-lg p-4 pr-6 pt-6 shadow-inner">
                    <div className="flex justify-between items-center mb-4 pl-8">
                        <h3 className="text-lg font-semibold text-slate-300">{mainLabel} Focus Over Time</h3>
                        {selectedStudentId && <button onClick={() => setSelectedStudentId(null)} className="text-xs text-sky-400 hover:text-sky-300">View Class Average</button>}
                    </div>
                    <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={displayData.focusHistory} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                            <XAxis dataKey="time" stroke="#94a3b8" tickFormatter={(t) => formatTime(t as number)} />
                            <YAxis domain={[0, 100]} stroke="#94a3b8" />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}
                                labelStyle={{ color: '#cbd5e1' }}
                                itemStyle={{ color: '#38bdf8' }}
                            />
                            <Line type="monotone" dataKey="score" name="Focus" stroke="#38bdf8" strokeWidth={2} dot={false} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
                <div className="lg:col-span-1 bg-slate-700/50 rounded-lg p-4 shadow-inner flex flex-col">
                    <h3 className="text-lg font-semibold text-slate-300 mb-4">Event Log</h3>
                    <div className="space-y-2 overflow-y-auto flex-grow max-h-48 pr-2">
                        {distractionEvents.length === 0 && isSessionActive && <p className="text-sm text-slate-400">No significant distractions detected yet.</p>}
                        {distractionEvents.length === 0 && !isSessionActive && studentsArray.length > 0 && <p className="text-sm text-slate-400">Great session! No major distractions were logged.</p>}
                        {distractionEvents.slice().reverse().map((event, index) => (
                            <div key={index} className="flex items-center gap-3 text-sm">
                                <span className="text-slate-500 font-mono">{formatTime(event.time)}</span>
                                <EyeOffIcon className="w-4 h-4 text-yellow-500 flex-shrink-0"/>
                                <span className="text-slate-300">{event.studentName}'s focus dropped.</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FocusMonitor;