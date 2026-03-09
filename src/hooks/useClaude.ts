import { useState } from 'react';
import * as claudeAPI from '../utils/claude';
import type { TaskExplanation, PreviousPhotoSummary } from '../utils/claude';
import type { ElectricalPanelInfo } from '../types';

/**
 * Hook for Claude API interactions
 */
export function useClaude(apiKey: string | null) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyzePanel = async (imageBlob: Blob, language: string = 'en', jobContext?: { name: string; description?: string; address?: string }, previousPhotos?: PreviousPhotoSummary[]): Promise<ElectricalPanelInfo> => {
    if (!apiKey) {
      throw new Error('API key is not configured. Please add your Claude API key in settings.');
    }

    try {
      setLoading(true);
      setError(null);
      const result = await claudeAPI.analyzeElectricalPanel(imageBlob, apiKey, language, jobContext, previousPhotos);
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to analyze image';
      setError(errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const askQuestion = async (question: string, context?: string): Promise<string> => {
    if (!apiKey) {
      throw new Error('API key is not configured. Please add your Claude API key in settings.');
    }

    try {
      setLoading(true);
      setError(null);
      const result = await claudeAPI.askElectricalQuestion(question, apiKey, context);
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to get response';
      setError(errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const explainTask = async (taskTitle: string, imageBlob: Blob, language: string = 'en'): Promise<TaskExplanation> => {
    if (!apiKey) {
      throw new Error('API key is not configured. Please add your Claude API key in settings.');
    }

    try {
      setLoading(true);
      setError(null);
      const result = await claudeAPI.explainTask(taskTitle, imageBlob, apiKey, language);
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to explain task';
      setError(errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    error,
    analyzePanel,
    askQuestion,
    explainTask,
  };
}
