"use client";

import { createContext, useContext } from "react";

export interface TeacherSchool {
  id?: string;
  name?: string;
  school_code?: string;
  city?: string;
  state?: string;
  address?: string;
  assignment?: { school_id?: string; grades_assigned?: unknown; subjects?: unknown; is_primary?: boolean };
}

interface TeacherSchoolContextType {
  selectedSchool: TeacherSchool | null;
  schools: TeacherSchool[];
  onSchoolChange: (school: TeacherSchool | null) => void;
}

const TeacherSchoolContext = createContext<TeacherSchoolContextType>({
  selectedSchool: null,
  schools: [],
  onSchoolChange: () => {},
});

export function useTeacherSchool() {
  return useContext(TeacherSchoolContext);
}

export { TeacherSchoolContext };






