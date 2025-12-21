'use client'

import { useState, useEffect } from 'react'
import { Card } from '../../ui/card'
import { Button } from '../../ui/button'
import { Textarea } from '../../ui/textarea'
import { Save, FileText, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'

interface NoteTakingPanelProps {
  courseId: string
  chapterId?: string
  contentId?: string
  isOpen?: boolean
  onToggle?: () => void
}

export default function NoteTakingPanel({
  courseId,
  chapterId,
  contentId,
  isOpen = false,
  onToggle,
}: NoteTakingPanelProps) {
  const [noteText, setNoteText] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Load existing note
  useEffect(() => {
    const loadNote = async () => {
      if (!contentId) return

      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data: notes } = await supabase
          .from('student_notes')
          .select('note_text')
          .eq('student_id', user.id)
          .eq('course_id', courseId)
          .eq('chapter_id', chapterId || '')
          .eq('content_id', contentId)
          .single()

        if (notes) {
          setNoteText(notes.note_text || '')
          setSaved(true)
        }
      } catch (error) {
        console.error('Error loading note:', error)
      }
    }

    loadNote()
  }, [courseId, chapterId, contentId])

  const handleSave = async () => {
    if (!contentId || !chapterId) return

    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { error } = await supabase
        .from('student_notes')
        .upsert({
          student_id: user.id,
          course_id: courseId,
          chapter_id: chapterId,
          content_id: contentId,
          note_text: noteText,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'student_id,course_id,chapter_id,content_id'
        })

      if (error) throw error

      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (error) {
      console.error('Error saving note:', error)
      alert('Failed to save note. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen && onToggle) {
    return (
      <Card className="p-4">
        <Button variant="outline" onClick={onToggle} className="w-full">
          <FileText className="h-4 w-4 mr-2" />
          Take Notes
        </Button>
      </Card>
    )
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-lg">My Notes</h3>
        {onToggle && (
          <Button variant="ghost" size="sm" onClick={onToggle}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <Textarea
        value={noteText}
        onChange={(e) => setNoteText(e.target.value)}
        placeholder="Write your notes here..."
        className="min-h-[200px] mb-4"
      />

      <div className="flex items-center justify-between">
        <Button
          onClick={handleSave}
          disabled={saving || !contentId}
          size="sm"
          className="flex items-center gap-2"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Note'}
        </Button>
        {saved && (
          <span className="text-sm text-green-600">Note saved successfully</span>
        )}
      </div>
    </Card>
  )
}


















