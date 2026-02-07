"use client";

import StudentProgressTab from "../../../components/school-admin/StudentProgressTab";

export default function StudentProgressPage() {
  return (
    <div className="p-4 md:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Student Progress</h1>
        <p className="text-gray-600 mt-2">Track and analyze student performance and course completion</p>
      </div>
      <StudentProgressTab />
    </div>
  );
}


