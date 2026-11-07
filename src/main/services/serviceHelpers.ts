import type { MediaInfo, OperationRequest } from '../../shared/media';

export type Req<M extends OperationRequest['module']> = Extract<OperationRequest, { module: M }>;

/** "a.mp4" or "a.mp4 + 3" for job titles. */
export const jobNames = (inputs: MediaInfo[]): string => {
  const first = inputs[0]?.path.split(/[\\/]/).pop() ?? '';
  return inputs.length > 1 ? `${first} + ${inputs.length - 1}` : first;
};
