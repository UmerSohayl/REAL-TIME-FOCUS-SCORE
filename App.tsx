
import React from 'react';
import FocusMonitor from './components/FocusMonitor';
import { BrainCircuitIcon } from './components/Icons';

const App: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col p-4 sm:p-6 lg:p-8">
      <header className="w-full max-w-7xl mx-auto mb-8">
        <div className="flex justify-center sm:justify-start items-center space-x-3">
            <div className="bg-sky-500 p-2 rounded-lg">
                <BrainCircuitIcon className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            FocusFlow
            </h1>
        </div>
      </header>

      <main className="flex-grow w-full max-w-7xl mx-auto">
        <FocusMonitor />
      </main>

      <footer className="w-full max-w-7xl mx-auto mt-8 text-center text-slate-500 text-sm">
        <p>FocusFlow &copy; 2024. AI-powered attention support for modern classrooms.</p>
      </footer>
    </div>
  );
};

export default App;
