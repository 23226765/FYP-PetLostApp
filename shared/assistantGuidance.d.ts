export type AssistantLocale = 'en' | 'zh-HK' | 'zh-CN'
export type AssistantAction = 'report' | 'radar' | 'map' | 'matching' | 'rescue' | 'settings' | 'messages' | 'profile'
export interface AssistantTopic { id: string; question: string; answer: string; keywords: string[]; action: AssistantAction }
export const ASSISTANT_LIMITS: Readonly<{ text: number; history: number; context: number; answer: number; transcript: number }>
export function assistantTopics(locale: string): AssistantTopic[]
export function unknownReviewedHelp(locale: string): { id: string; answer: string }
export function findReviewedHelp(text: string, locale: string): { id: string; answer: string } | null
