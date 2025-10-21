export interface FocusDataPoint {
  time: number;
  score: number;
}

export interface Student {
  id: number;
  box: { x: number; y: number; width: number; height: number };
  focusScore: number;
  lastBlink: number;
  eyesClosedDuration: number;
  focusHistory: FocusDataPoint[];
  averageFocus: number;
}

export interface DistractionEvent {
  time: number;
  studentId: number;
  studentName: string;
}

export interface SessionSummaryData {
  duration: number;
  overallAverage: number;
  students: Student[];
  events: DistractionEvent[];
}
