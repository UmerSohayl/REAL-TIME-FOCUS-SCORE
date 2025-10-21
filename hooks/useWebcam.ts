import { useState, useRef, useCallback, useEffect } from 'react';

export const useWebcam = () => {
    const [isSessionActive, setIsSessionActive] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const stopSession = useCallback(() => {
        setIsSessionActive(false);
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
    }, []);
    
    const startSession = useCallback(async () => {
        setError(null);
        if (isSessionActive) return;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await new Promise(resolve => {
                    if (videoRef.current) {
                        videoRef.current.onloadedmetadata = resolve;
                    }
                });
            }
            setIsSessionActive(true);
        } catch (err) {
            console.error("Error accessing webcam:", err);
            setError("Could not access the webcam. Please check permissions and try again.");
            stopSession();
        }
    }, [isSessionActive, stopSession]);

    useEffect(() => {
        // Cleanup on unmount
        return () => stopSession();
    }, [stopSession]);

    return { videoRef, streamRef, isSessionActive, error, startSession, stopSession };
};
