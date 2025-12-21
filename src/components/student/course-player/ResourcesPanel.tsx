'use client'

import { Card } from '../../ui/card'
import { Button } from '../../ui/button'
import { Download, File, FileText, Image, Video, FileDown } from 'lucide-react'
import { cn } from '../../../lib/utils'

interface Material {
  id: string
  title: string
  file_url: string
  file_type?: string
  chapter_id: string
}

interface ResourcesPanelProps {
  courseId: string
  chapterId?: string
  materials: Material[]
  isOpen?: boolean
  onToggle?: () => void
}

export default function ResourcesPanel({
  courseId,
  chapterId,
  materials,
  isOpen = false,
  onToggle,
}: ResourcesPanelProps) {
  // Filter materials by chapter if chapterId is provided
  const filteredMaterials = chapterId
    ? materials.filter((m) => m.chapter_id === chapterId)
    : materials

  const getFileIcon = (fileType?: string) => {
    const type = (fileType || '').toLowerCase()
    if (type.includes('pdf')) return FileText
    if (type.includes('image') || type.includes('jpg') || type.includes('png')) return Image
    if (type.includes('video')) return Video
    return File
  }

  const getFileTypeLabel = (fileType?: string) => {
    const type = (fileType || '').toLowerCase()
    if (type.includes('pdf')) return 'PDF'
    if (type.includes('doc')) return 'Document'
    if (type.includes('image') || type.includes('jpg') || type.includes('png')) return 'Image'
    if (type.includes('video')) return 'Video'
    return 'File'
  }

  if (!isOpen && onToggle) {
    return (
      <Card className="p-4">
        <Button variant="outline" onClick={onToggle} className="w-full">
          <FileDown className="h-4 w-4 mr-2" />
          Show Resources ({filteredMaterials.length})
        </Button>
      </Card>
    )
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-lg">Downloadable Resources</h3>
        {onToggle && (
          <Button variant="ghost" size="sm" onClick={onToggle}>
            ×
          </Button>
        )}
      </div>

      {filteredMaterials.length > 0 ? (
        <div className="space-y-2">
          {filteredMaterials.map((material) => {
            const Icon = getFileIcon(material.file_type)
            const fileTypeLabel = getFileTypeLabel(material.file_type)

            return (
              <div
                key={material.id}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Icon className="h-5 w-5 text-blue-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{material.title}</p>
                    <p className="text-xs text-gray-500">{fileTypeLabel}</p>
                  </div>
                </div>
                <a
                  href={material.file_url}
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-shrink-0"
                >
                  <Button variant="outline" size="sm">
                    <Download className="h-4 w-4" />
                  </Button>
                </a>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500">
          <File className="h-12 w-12 mx-auto mb-4 text-gray-300" />
          <p className="text-sm">No resources available</p>
        </div>
      )}
    </Card>
  )
}


















