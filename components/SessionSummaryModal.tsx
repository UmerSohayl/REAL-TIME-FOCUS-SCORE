import React from 'react';
import { SessionSummaryData, Student } from '../types';
import { EyeOffIcon } from './Icons';

interface SessionSummaryModalProps {
  data: SessionSummaryData;
  onClose: () => void;
  formatTime: (seconds: number) => string;
}

const getScoreColor = (score: number) => {
    if (score > 70) return 'text-teal-400';
    if (score > 40) return 'text-yellow-400';
    return 'text-red-400';
};

const StudentFocusRow: React.FC<{ student: Student }> = ({ student }) => (
    <div className="flex justify-between items-center p-2 rounded-md bg-slate-700/50">
        <span className="font-semibold">{`Student ${student.id}`}</span>
        <span className={`font-bold text-lg ${getScoreColor(student.averageFocus)}`}>
            {student.averageFocus}%
        </span>
    </div>
);

const SessionSummaryModal: React.FC<SessionSummaryModalProps> = ({ data, onClose, formatTime }) => {
    const sortedStudents = [...data.students].sort((a, b) => b.averageFocus - a.averageFocus);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl shadow-2xl w-full max-w-2xl border border-slate-700 max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-slate-700">
          <h2 className="text-2xl font-bold text-white">Session Summary</h2>
          <p className="text-slate-400">A review of the completed monitoring session.</p>
        </div>
        
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 text-center">
            <div className="bg-slate-700/50 p-4 rounded-lg">
                <p className="text-sm text-slate-400">Session Duration</p>
                <p className="text-3xl font-bold text-teal-400">{formatTime(data.duration)}</p>
            </div>
            <div className="bg-slate-700/50 p-4 rounded-lg">
                <p className="text-sm text-slate-400">Overall Average Focus</p>
                <p className={`text-3xl font-bold ${getScoreColor(data.overallAverage)}`}>{data.overallAverage}%</p>
            </div>
        </div>

        <div className="px-6 pb-6 flex-grow overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <h3 className="font-semibold text-lg mb-3 text-slate-200">Student Performance</h3>
                    <div className="space-y-2">
                        {sortedStudents.length > 0 ? (
                            sortedStudents.map(student => <StudentFocusRow key={student.id} student={student} />)
                        ) : (
                            <p className="text-slate-500 text-sm">No student data was recorded.</p>
                        )}
                    </div>
                </div>
                <div>
                    <h3 className="font-semibold text-lg mb-3 text-slate-200">Distraction Events</h3>
                    <div className="space-y-2">
                        {data.events.length > 0 ? (
                             data.events.map((event, index) => (
                                <div key={index} className="flex items-center gap-3 text-sm p-2 rounded-md bg-slate-700/50">
                                    <span className="text-slate-500 font-mono">{formatTime(event.time)}</span>
                                    <EyeOffIcon className="w-4 h-4 text-yellow-500 flex-shrink-0"/>
                                    <span className="text-slate-300">{event.studentName}'s focus dropped.</span>
                                </div>
                            ))
                        ) : (
                            <p className="text-slate-500 text-sm">No significant distractions were logged.</p>
                        )}
                    </div>
                </div>
            </div>
        </div>

        <div className="p-6 border-t border-slate-700 mt-auto">
          <button
            onClick={onClose}
            className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold py-3 px-4 rounded-lg transition duration-300"
          >
            Close Summary
          </button>
        </div>
      </div>
    </div>
  );
};

export default SessionSummaryModal;
