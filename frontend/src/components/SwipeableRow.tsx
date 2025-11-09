import { useSwipe } from '../hooks/useSwipe'
import { ReactNode } from 'react'

interface SwipeableRowProps {
  children: ReactNode
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  leftAction?: ReactNode
  rightAction?: ReactNode
  threshold?: number
  enabled?: boolean
  className?: string
}

export function SwipeableRow({ 
  children, 
  onSwipeLeft, 
  onSwipeRight, 
  leftAction, 
  rightAction,
  threshold = 50,
  enabled = true,
  className = ''
}: SwipeableRowProps) {
  const { swipeDistance, isSwiping, handlers } = useSwipe({
    onSwipeLeft,
    onSwipeRight,
    threshold,
    enabled,
  })

  const showLeftAction = swipeDistance < -threshold
  const showRightAction = swipeDistance > threshold

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* Background Actions */}
      <div className="absolute inset-0 flex">
        {leftAction && (
          <div 
            className={`flex items-center justify-end px-4 bg-red-600 transition-transform duration-200 ${
              showLeftAction ? 'translate-x-0' : 'translate-x-full'
            }`}
            style={{ width: '100%', transform: `translateX(${Math.min(swipeDistance, 0)}px)` }}
          >
            {leftAction}
          </div>
        )}
        {rightAction && (
          <div 
            className={`flex items-center justify-start px-4 bg-blue-600 transition-transform duration-200 ${
              showRightAction ? 'translate-x-0' : '-translate-x-full'
            }`}
            style={{ width: '100%', transform: `translateX(${Math.max(swipeDistance, 0)}px)` }}
          >
            {rightAction}
          </div>
        )}
      </div>

      {/* Main Content */}
      <div
        {...handlers}
        className={`relative bg-gray-800 transition-transform duration-200 ${
          isSwiping ? 'transition-none' : ''
        }`}
        style={{
          transform: `translateX(${swipeDistance}px)`,
        }}
      >
        {children}
      </div>
    </div>
  )
}

