import { useEffect, useRef, useState } from 'react'

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void> | void
  threshold?: number
  enabled?: boolean
}

export function usePullToRefresh({ onRefresh, threshold = 80, enabled = true }: UsePullToRefreshOptions) {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  const startY = useRef<number | null>(null)
  const elementRef = useRef<HTMLDivElement | null>(null)
  const isPullingRef = useRef(false)

  useEffect(() => {
    if (!enabled) return

    const handleTouchStart = (e: TouchEvent) => {
      // Only trigger if at the top of the page
      if (window.scrollY === 0 && !isRefreshing) {
        startY.current = e.touches[0].clientY
        isPullingRef.current = true
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!isPullingRef.current || startY.current === null || isRefreshing) return

      const currentY = e.touches[0].clientY
      const distance = currentY - startY.current

      if (distance > 0 && window.scrollY === 0) {
        e.preventDefault()
        setPullDistance(Math.min(distance, threshold * 2))
      } else {
        isPullingRef.current = false
        setPullDistance(0)
      }
    }

    const handleTouchEnd = async () => {
      if (isRefreshing) return

      if (pullDistance >= threshold && isPullingRef.current) {
        setIsRefreshing(true)
        setPullDistance(0)
        try {
          await onRefresh()
        } finally {
          setIsRefreshing(false)
        }
      } else {
        setPullDistance(0)
      }
      isPullingRef.current = false
      startY.current = null
    }

    const element = elementRef.current || document
    element.addEventListener('touchstart', handleTouchStart as EventListener, { passive: true })
    element.addEventListener('touchmove', handleTouchMove as EventListener, { passive: false })
    element.addEventListener('touchend', handleTouchEnd as EventListener, { passive: true })

    return () => {
      element.removeEventListener('touchstart', handleTouchStart as EventListener)
      element.removeEventListener('touchmove', handleTouchMove as EventListener)
      element.removeEventListener('touchend', handleTouchEnd as EventListener)
    }
  }, [onRefresh, threshold, enabled, pullDistance, isRefreshing])

  return {
    isRefreshing,
    pullDistance,
    pullProgress: Math.min(pullDistance / threshold, 1),
    elementRef,
  }
}

