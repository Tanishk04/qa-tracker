import { useQuery } from '@tanstack/react-query'
import { getSettings, listDevelopers, listReleases } from '../lib/api'

export function useSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: getSettings })
}
export function useDevelopers() {
  return useQuery({ queryKey: ['developers'], queryFn: listDevelopers })
}
export function useReleases() {
  return useQuery({ queryKey: ['releases'], queryFn: listReleases })
}
