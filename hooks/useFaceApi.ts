import { useState, useEffect, useCallback } from 'react';

// Access face-api.js from the global scope
declare const faceapi: any;

const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';

export const useFaceApi = () => {
    const [modelsLoaded, setModelsLoaded] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadModels = useCallback(async () => {
        try {
            await Promise.all([
                faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
                faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
            ]);
            setModelsLoaded(true);
        } catch (e) {
            console.error("Failed to load models", e);
            setError("Could not load AI models for face detection. Please refresh the page.");
        }
    }, []);

    useEffect(() => {
        loadModels();
    }, [loadModels]);

    return { modelsLoaded, error };
};
