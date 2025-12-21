export default function TeacherLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-lg font-medium text-gray-900">Loading Teacher Dashboard...</p>
        <p className="text-sm text-gray-600 mt-2">Please wait</p>
      </div>
    </div>
  )
}






