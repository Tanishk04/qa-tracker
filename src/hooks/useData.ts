import { useQuery } from '@tanstack/react-query'
import { listRecentLogs, listTasks, listUserStories } from '../lib/api'

export function useStories() {
  return useQuery({ queryKey: ['stories'], queryFn: listUserStories })
}
export function useTasks() {
  return useQuery({
    queryKey: ['tasks'],
    queryFn: listTasks,
    refetchInterval: 30_000,
  })
}
export function useLogs() {
  return useQuery({
    queryKey: ['logs'],
    queryFn: () => listRecentLogs(),
    refetchInterval: 60_000,
  })
}
