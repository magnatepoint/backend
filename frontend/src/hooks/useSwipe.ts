import { useRef, useState, TouchEvent } from 'react'

interface UseSwipeOptions {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  threshold?: number
  enabled?: boolean
}

export function useSwipe({ onSwipeLeft, onSwipeRight, threshold = 50, enabled = true }: UseSwipeOptions) {
  const [swipeDistance, setSwipeDistance] = useState(0)
  const [isSwiping, setIsSwiping] = useState(false)
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)

  const handleTouchStart = (e: TouchEvent) => {
    if (!enabled) return
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
    setIsSwiping(true)
  }

  const handleTouchMove = (e: TouchEvent) => {
    if (!enabled || touchStartX.current === null || touchStartY.current === null) return

    const currentX = e.touches[0].clientX
    const currentY = e.touches[0].clientY
    const deltaX = currentX - touchStartX.current
    const deltaY = currentY - touchStartY.current

    // Only consider horizontal swipes (ignore if vertical movement is greater)
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      setSwipeDistance(deltaX)
    }
  }

  const handleTouchEnd = () => {
    if (!enabled) return

    if (Math.abs(swipeDistance) >= threshold) {
      if (swipeDistance < 0 && onSwipeLeft) {
        onSwipeLeft()
      } else if (swipeDistance > 0 && onSwipeRight) {
        onSwipeRight()
      }
    }

    setSwipeDistance(0)
    setIsSwiping(false)
    touchStartX.current = null
    touchStartY.current = null
  }

  return {
    swipeDistance,
    isSwiping,
    handlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
  }
}

