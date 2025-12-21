import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  createStudentSchema,
  updateStudentSchema,
  createTeacherSchema,
  updateTeacherSchema,
  createSchoolSchema,
  validateRequestBody,
  validateQueryParams,
  uuidSchema,
} from '../validation-schemas';

describe('Validation Schemas', () => {
  describe('UUID Schema', () => {
    it('should validate correct UUID', () => {
      const validUUID = '123e4567-e89b-12d3-a456-426614174000';
      expect(() => uuidSchema.parse(validUUID)).not.toThrow();
    });

    it('should reject invalid UUID', () => {
      const invalidUUID = 'not-a-uuid';
      expect(() => uuidSchema.parse(invalidUUID)).toThrow();
    });
  });

  describe('Create Student Schema', () => {
    it('should validate correct student data', () => {
      const validStudent = {
        full_name: 'John Doe',
        email: 'john@example.com',
        password: 'Password123',
        school_id: '123e4567-e89b-12d3-a456-426614174000',
        grade: '5',
        phone: '+1234567890',
      };

      expect(() => createStudentSchema.parse(validStudent)).not.toThrow();
    });

    it('should reject student with invalid email', () => {
      const invalidStudent = {
        full_name: 'John Doe',
        email: 'invalid-email',
        password: 'Password123',
        school_id: '123e4567-e89b-12d3-a456-426614174000',
      };

      expect(() => createStudentSchema.parse(invalidStudent)).toThrow();
    });

    it('should reject student with weak password', () => {
      const invalidStudent = {
        full_name: 'John Doe',
        email: 'john@example.com',
        password: 'weak',
        school_id: '123e4567-e89b-12d3-a456-426614174000',
      };

      expect(() => createStudentSchema.parse(invalidStudent)).toThrow();
    });

    it('should reject student with invalid UUID', () => {
      const invalidStudent = {
        full_name: 'John Doe',
        email: 'john@example.com',
        password: 'Password123',
        school_id: 'invalid-uuid',
      };

      expect(() => createStudentSchema.parse(invalidStudent)).toThrow();
    });

    it('should reject empty name', () => {
      const invalidStudent = {
        full_name: '',
        email: 'john@example.com',
        password: 'Password123',
        school_id: '123e4567-e89b-12d3-a456-426614174000',
      };

      expect(() => createStudentSchema.parse(invalidStudent)).toThrow();
    });
  });

  describe('Update Student Schema', () => {
    it('should validate partial student data', () => {
      const validUpdate = {
        full_name: 'Jane Doe',
      };

      expect(() => updateStudentSchema.parse(validUpdate)).not.toThrow();
    });

    it('should allow all fields to be optional', () => {
      const emptyUpdate: any = {};

      expect(() => updateStudentSchema.parse(emptyUpdate)).not.toThrow();
    });
  });

  describe('Create Teacher Schema', () => {
    it('should validate correct teacher data', () => {
      const validTeacher = {
        full_name: 'Jane Smith',
        email: 'jane@example.com',
        temp_password: 'Password123',
        phone: '+1234567890',
      };

      expect(() => createTeacherSchema.parse(validTeacher)).not.toThrow();
    });

    it('should validate teacher with school assignments', () => {
      const validTeacher = {
        full_name: 'Jane Smith',
        email: 'jane@example.com',
        temp_password: 'Password123',
        school_assignments: [
          {
            school_id: '123e4567-e89b-12d3-a456-426614174000',
            grades_assigned: ['5', '6'],
            subjects: ['Math', 'Science'],
          },
        ],
      };

      expect(() => createTeacherSchema.parse(validTeacher)).not.toThrow();
    });
  });

  describe('Create School Schema', () => {
    it('should validate correct school data', () => {
      const validSchool = {
        name: 'Test School',
        contact_email: 'contact@school.com',
        contact_phone: '+1234567890',
        address: '123 Main St',
      };

      expect(() => createSchoolSchema.parse(validSchool)).not.toThrow();
    });

    it('should validate school with all optional fields', () => {
      const validSchool = {
        name: 'Test School',
        contact_email: 'contact@school.com',
        contact_phone: '+1234567890',
        address: '123 Main St',
        city: 'New York',
        state: 'NY',
        pincode: '10001',
        established_year: 2000,
      };

      expect(() => createSchoolSchema.parse(validSchool)).not.toThrow();
    });
  });

  describe('validateRequestBody', () => {
    it('should return success for valid data', () => {
      const schema = createStudentSchema;
      const validData = {
        full_name: 'John Doe',
        email: 'john@example.com',
        password: 'Password123',
        school_id: '123e4567-e89b-12d3-a456-426614174000',
      };

      const result = validateRequestBody(schema, validData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toMatchObject(validData);
      }
    });

    it('should return error for invalid data', () => {
      const schema = createStudentSchema;
      const invalidData = {
        full_name: '',
        email: 'invalid-email',
        password: 'weak',
        school_id: 'not-uuid',
      };

      const result = validateRequestBody(schema, invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Validation failed');
        expect(result.details).toBeDefined();
      }
    });
  });

  describe('validateQueryParams', () => {
    it('should validate query parameters', () => {
      const schema = z.object({ id: uuidSchema });
      const searchParams = new URLSearchParams({ id: '123e4567-e89b-12d3-a456-426614174000' });

      const result = validateQueryParams(schema, searchParams);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe('123e4567-e89b-12d3-a456-426614174000');
      }
    });

    it('should return error for invalid query parameters', () => {
      const schema = z.object({ id: uuidSchema });
      const searchParams = new URLSearchParams({ id: 'not-uuid' });

      const result = validateQueryParams(schema, searchParams);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Validation failed');
      }
    });
  });
});

