'use client'

import { Card } from '../../ui/card'
import { Button } from '../../ui/button'
import { AlertCircle, RefreshCw } from 'lucide-react'

interface ContentErrorProps {
  error: Error | string
  onRetry?: () => void
}

export default function ContentError({ error, onRetry }: ContentErrorProps) {
  const errorMessage = typeof error === 'string' ? error : error.message

  return (
    <Card className="p-6">
      <div className="text-center">
        <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
        <h3 className="text-lg font-semibold mb-2">Error Loading Content</h3>
        <p className="text-gray-600 mb-4">{errorMessage}</p>
        {onRetry && (
          <Button onClick={onRetry} variant="outline" className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Try Again
          </Button>
        )}
      </div>
    </Card>
  )
}


















