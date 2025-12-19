"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Checkbox } from "../ui/checkbox";
import { Search, School, X, CheckCircle2, AlertCircle } from "lucide-react";
import { fetchWithCsrf } from "../../lib/csrf-client";
import { Alert, AlertDescription } from "../ui/alert";

interface School {
  id: string;
  name: string;
  school_code?: string;
  is_active?: boolean;
  grades_offered?: string[];
}

interface SchoolGradeSelectorProps {
  selectedSchoolIds: string[];
  selectedGrades: string[];
  onSchoolChange: (schoolIds: string[]) => void;
  onGradeChange: (grades: string[]) => void;
  required?: boolean;
  error?: string;
  disabled?: boolean;
}

const gradeOptions = [
  { value: "grade1", label: "Grade 1" },
  { value: "grade2", label: "Grade 2" },
  { value: "grade3", label: "Grade 3" },
  { value: "grade4", label: "Grade 4" },
  { value: "grade5", label: "Grade 5" },
  { value: "grade6", label: "Grade 6" },
  { value: "grade7", label: "Grade 7" },
  { value: "grade8", label: "Grade 8" },
  { value: "grade9", label: "Grade 9" },
  { value: "grade10", label: "Grade 10" },
  { value: "grade11", label: "Grade 11" },
  { value: "grade12", label: "Grade 12" },
];

export function SchoolGradeSelector({
  selectedSchoolIds,
  selectedGrades,
  onSchoolChange,
  onGradeChange,
  required = false,
  error,
  disabled = false,
}: SchoolGradeSelectorProps) {
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [schoolSearchOpen, setSchoolSearchOpen] = useState(false);

  // Load schools on mount
  useEffect(() => {
    loadSchools();
  }, []);

  const loadSchools = async () => {
    setLoading(true);
    try {
      const response = await fetchWithCsrf("/api/admin/schools", {
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        console.error("Failed to fetch schools:", response.statusText);
        return;
      }

      const data = await response.json();
      if (data.schools && Array.isArray(data.schools)) {
        setSchools(data.schools.filter((s: School) => s.is_active !== false));
      }
    } catch (error) {
      console.error("Error fetching schools:", error);
    } finally {
      setLoading(false);
    }
  };

  // Filter schools based on search term
  const filteredSchools = useMemo(() => {
    if (!searchTerm.trim()) return schools;
    const term = searchTerm.toLowerCase();
    return schools.filter(
      (school) =>
        school.name.toLowerCase().includes(term) ||
        school.school_code?.toLowerCase().includes(term)
    );
  }, [schools, searchTerm]);

  // Get selected school names
  const selectedSchoolNames = useMemo(() => {
    return schools
      .filter((s) => selectedSchoolIds.includes(s.id))
      .map((s) => s.name);
  }, [schools, selectedSchoolIds]);

  // Toggle school selection
  const toggleSchool = (schoolId: string) => {
    if (disabled) return;
    if (selectedSchoolIds.includes(schoolId)) {
      onSchoolChange(selectedSchoolIds.filter((id) => id !== schoolId));
    } else {
      onSchoolChange([...selectedSchoolIds, schoolId]);
    }
  };

  // Toggle grade selection
  const toggleGrade = (grade: string) => {
    if (disabled) return;
    if (selectedGrades.includes(grade)) {
      onGradeChange(selectedGrades.filter((g) => g !== grade));
    } else {
      onGradeChange([...selectedGrades, grade]);
    }
  };

  // Select all grades
  const selectAllGrades = () => {
    if (disabled) return;
    onGradeChange(gradeOptions.map((g) => g.value));
  };

  // Clear all grades
  const clearAllGrades = () => {
    if (disabled) return;
    onGradeChange([]);
  };

  // Remove school
  const removeSchool = (schoolId: string) => {
    if (disabled) return;
    onSchoolChange(selectedSchoolIds.filter((id) => id !== schoolId));
  };

  // Clear all schools
  const clearAllSchools = () => {
    if (disabled) return;
    onSchoolChange([]);
  };

  const isValid = !required || (selectedSchoolIds.length > 0 && selectedGrades.length > 0);

  return (
    <div className="space-y-4">
      {/* School Selection */}
      <div className="space-y-2">
        <Label htmlFor="school-selector" className="flex items-center gap-2">
          <School className="h-4 w-4" />
          Schools {required && <span className="text-red-500">*</span>}
        </Label>
        
        {error && (
          <Alert variant="destructive" className="py-2">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Selected Schools Display */}
        {selectedSchoolIds.length > 0 && (
          <div className="flex flex-wrap gap-2 p-2 bg-gray-50 rounded-md border">
            {selectedSchoolNames.map((name, idx) => {
              const schoolId = selectedSchoolIds[idx];
              return (
                <Badge
                  key={schoolId || 'undefined'}
                  variant="secondary"
                  className="flex items-center gap-1 px-2 py-1"
                >
                  {name}
                  {!disabled && (
                    <button
                      type="button"
                      onClick={() => removeSchool(schoolId)}
                      className="ml-1 hover:bg-gray-200 rounded-full p-0.5"
                      aria-label={`Remove ${name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </Badge>
              );
            })}
            {!disabled && selectedSchoolIds.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearAllSchools}
                className="h-6 px-2 text-xs"
              >
                Clear All
              </Button>
            )}
          </div>
        )}

        {/* School Search and Selection */}
        <div className="relative">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              id="school-selector"
              type="text"
              placeholder="Search schools..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onFocus={() => setSchoolSearchOpen(true)}
              disabled={disabled}
              className="pl-10"
              aria-label="Search schools"
            />
          </div>

          {/* School Dropdown */}
          {schoolSearchOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setSchoolSearchOpen(false)}
                aria-hidden="true"
              />
              <Card className="absolute z-20 w-full mt-1 max-h-64 overflow-y-auto shadow-lg">
                <CardContent className="p-2">
                  {loading ? (
                    <div className="p-4 text-center text-sm text-gray-500">
                      Loading schools...
                    </div>
                  ) : filteredSchools.length === 0 ? (
                    <div className="p-4 text-center text-sm text-gray-500">
                      No schools found
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {filteredSchools.map((school) => (
                        <label
                          key={school.id}
                          className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer"
                        >
                          <Checkbox
                            checked={selectedSchoolIds.includes(school.id)}
                            onCheckedChange={() => toggleSchool(school.id)}
                            disabled={disabled}
                            aria-label={`Select ${school.name}`}
                          />
                          <div className="flex-1">
                            <div className="text-sm font-medium">{school.name}</div>
                            {school.school_code && (
                              <div className="text-xs text-gray-500">
                                Code: {school.school_code}
                              </div>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {selectedSchoolIds.length === 0 && (
          <p className="text-sm text-gray-500">
            Select at least one school {required && "(required)"}
          </p>
        )}
      </div>

      {/* Grade Selection */}
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          Grades {required && <span className="text-red-500">*</span>}
        </Label>

        {/* Grade Selection Actions */}
        {!disabled && (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={selectAllGrades}
              className="text-xs"
            >
              Select All
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={clearAllGrades}
              className="text-xs"
            >
              Clear All
            </Button>
          </div>
        )}

        {/* Grade Checkboxes */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 p-3 border rounded-md bg-gray-50">
          {gradeOptions.map((grade) => (
            <label
              key={grade.value}
              className="flex items-center gap-2 cursor-pointer hover:bg-white p-2 rounded"
            >
              <Checkbox
                checked={selectedGrades.includes(grade.value)}
                onCheckedChange={() => toggleGrade(grade.value)}
                disabled={disabled}
                aria-label={`Select ${grade.label}`}
              />
              <span className="text-sm">{grade.label}</span>
            </label>
          ))}
        </div>

        {selectedGrades.length === 0 && (
          <p className="text-sm text-gray-500">
            Select at least one grade {required && "(required)"}
          </p>
        )}
      </div>

      {/* Validation Status */}
      {required && (
        <div className="flex items-center gap-2 text-sm">
          {isValid ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="text-green-600">Selection complete</span>
            </>
          ) : (
            <>
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <span className="text-amber-600">
                Please select at least one school and one grade
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}





















