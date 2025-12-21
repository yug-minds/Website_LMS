"use client";

import { createContext, useContext } from "react";

// Context for school selection
interface TeacherSchoolContextType {
   
  selectedSchool: any;
   
  schools: any[];
   
  onSchoolChange: (school: any) => void;
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






