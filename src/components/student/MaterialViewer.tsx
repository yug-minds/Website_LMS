'use client'

import Image from 'next/image'
import { Card } from '../ui/card'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'

import { 
  Download, 
  File, 
  FileText,
  Image as ImageIcon,
  ExternalLink,
  Eye
} from 'lucide-react'

interface MaterialViewerProps {
  url: string
  title: string
  type: 'pdf' | 'image' | 'document' | 'link'
  description?: string
  onView?: () => void
}

export default function MaterialViewer({ url, title, type, description, onView }: MaterialViewerProps) {
  const getIcon = () => {
    switch (type) {
      case 'pdf':
        return <File className="h-5 w-5 text-red-600" />
      case 'image':
        return <ImageIcon className="h-5 w-5 text-blue-600" />
      case 'document':
        return <FileText className="h-5 w-5 text-green-600" />
      case 'link':
        return <ExternalLink className="h-5 w-5 text-purple-600" />
      default:
        return <File className="h-5 w-5 text-gray-600" />
    }
  }

  const getBadgeColor = () => {
    switch (type) {
      case 'pdf':
        return 'bg-red-100 text-red-800 border-red-200'
      case 'image':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'document':
        return 'bg-green-100 text-green-800 border-green-200'
      case 'link':
        return 'bg-purple-100 text-purple-800 border-purple-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const renderPreview = () => {
    switch (type) {
      case 'pdf':
        return (
          <div className="aspect-video bg-gray-50 rounded-lg overflow-hidden">
            <iframe 
              src={`${url}#toolbar=0&navpanes=0`}
              className="w-full h-full"
              title={title}
            />
          </div>
        )
      case 'image':
        return (
          <div className="aspect-video bg-gray-50 rounded-lg overflow-hidden flex items-center justify-center relative">
            <Image 
              src={url} 
              alt={title}
              fill
              className="object-contain"
            />
          </div>
        )
      default:
        return (
          <div className="aspect-video bg-gray-50 rounded-lg flex items-center justify-center">
            <div className="text-center p-6">
              {getIcon()}
              <p className="mt-4 text-sm text-gray-600">Click the button below to view this material</p>
            </div>
          </div>
        )
    }
  }

  return (
    <Card>
      <div className="p-6 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            {getIcon()}
            <div>
              <h3 className="font-semibold text-gray-900">{title}</h3>
              {description && (
                <p className="text-sm text-gray-600 mt-1">{description}</p>
              )}
            </div>
          </div>
          <Badge className={getBadgeColor()}>
            {(type || 'file').toUpperCase()}
          </Badge>
        </div>

        {/* Preview */}
        {renderPreview()}

        {/* Actions */}
        <div className="flex gap-2 pt-4 border-t">
          <a 
            href={url} 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex-1"
            onClick={onView}
          >
            <Button variant="outline" className="w-full">
              <Eye className="h-4 w-4 mr-2" />
              View Full
            </Button>
          </a>
          <a 
            href={url} 
            download
            className="flex-1"
          >
            <Button className="w-full">
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
          </a>
        </div>
      </div>
    </Card>
  )
}

