'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '../../../../components/ui/card'
import { Button } from '../../../../components/ui/button'
import { supabase } from '../../../../lib/supabase'

export default function DebugPage() {
  const [status, setStatus] = useState<{
    auth: string
    api: string
    courses: string
    error?: string
  }>({
    auth: 'Checking...',
    api: 'Checking...',
    courses: 'Checking...',
  })

  useEffect(() => {
    const runDiagnostics = async () => {
      try {
        // Test 1: Authentication
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        setStatus(prev => ({
          ...prev,
          auth: authError ? `Error: ${authError.message}` : `✅ Authenticated: ${user?.email || 'No email'}`,
        }))

        if (!user) {
          setStatus(prev => ({ ...prev, error: 'No authenticated user' }))
          return
        }

        // Test 2: API Call
        try {
          const { data: { session } } = await supabase.auth.getSession()
          const response = await fetch('/api/student/courses', {
            headers: {
              'Authorization': `Bearer ${session?.access_token}`,
              'Content-Type': 'application/json',
            },
          })
          
          const data = await response.json()
          setStatus(prev => ({
            ...prev,
            api: response.ok 
              ? `✅ API OK: ${data.courses?.length || 0} courses` 
              : `❌ API Error: ${data.error || response.statusText}`,
          }))
        } catch (apiError: any) {
          setStatus(prev => ({
            ...prev,
            api: `❌ API Error: ${apiError.message}`,
          }))
        }

        // Test 3: Direct Database Query
        const { data: courses, error: coursesError } = await supabase
          .from('courses')
          .select('id, name, title')
          .limit(5)

        setStatus(prev => ({
          ...prev,
          courses: coursesError 
            ? `❌ DB Error: ${coursesError.message}` 
            : `✅ DB OK: ${courses?.length || 0} courses found`,
        }))
      } catch (error: any) {
        setStatus(prev => ({
          ...prev,
          error: error.message || 'Unknown error',
        }))
      }
    }

    runDiagnostics()
  }, [])

  return (
    <div className="p-6">
      <Card className="p-6">
        <h1 className="text-2xl font-bold mb-4">My Courses Debug</h1>
        <div className="space-y-4">
          <div>
            <strong>Authentication:</strong> {status.auth}
          </div>
          <div>
            <strong>API Endpoint:</strong> {status.api}
          </div>
          <div>
            <strong>Database:</strong> {status.courses}
          </div>
          {status.error && (
            <div className="text-red-600">
              <strong>Error:</strong> {status.error}
            </div>
          )}
          <Button onClick={() => window.location.href = '/student/my-courses'}>
            Go to My Courses
          </Button>
        </div>
      </Card>
    </div>
  )
}


















