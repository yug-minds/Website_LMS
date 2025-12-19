import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as GETHandler } from '../../route';

// Type assertion for GET handler to fix TypeScript inference
const GET = GETHandler as (request: NextRequest, context: { params: { id: string } }) => Promise<Response>;

// Mock dependencies
vi.mock('../../../../../../lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      if (table === 'courses') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({
                data: {
                  id: 'test-course-id',
                  name: 'Test Course',
                  course_name: 'Test Course',
                  description: 'Test Description',
                  num_chapters: 2,
                  content_summary: { videos: 1, materials: 1, assignments: 1 },
                  status: 'Published',
                  is_published: true,
                },
                error: null,
              })),
            })),
          })),
        };
      }
      if (table === 'chapters') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => Promise.resolve({
                data: [
                  {
                    id: 'chapter-1',
                    course_id: 'test-course-id',
                    title: 'Chapter 1',
                    name: 'Chapter 1',
                    description: 'First chapter',
                    order_index: 1,
                    order_number: 1,
                    learning_outcomes: [],
                    release_date: null,
                    is_published: true,
                  },
                  {
                    id: 'chapter-2',
                    course_id: 'test-course-id',
                    title: 'Chapter 2',
                    name: 'Chapter 2',
                    description: 'Second chapter',
                    order_index: 2,
                    order_number: 2,
                    learning_outcomes: [],
                    release_date: null,
                    is_published: true,
                  },
                ],
                error: null,
              })),
            })),
          })),
        };
      }
      if (table === 'chapter_contents') {
        return {
          select: vi.fn(() => ({
            in: vi.fn(() => ({
              order: vi.fn(() => Promise.resolve({
                data: [
                  {
                    id: 'content-1',
                    chapter_id: 'chapter-1',
                    content_type: 'text',
                    title: 'Introduction Text',
                    content_text: 'This is the introduction text',
                    content_url: null,
                    duration_minutes: null,
                    storage_path: null,
                    thumbnail_url: null,
                    content_label: null,
                    order_index: 1,
                    created_at: '2024-01-01T00:00:00Z',
                    updated_at: '2024-01-01T00:00:00Z',
                  },
                  {
                    id: 'content-2',
                    chapter_id: 'chapter-1',
                    content_type: 'video_link',
                    title: 'Introduction Video',
                    content_text: null,
                    content_url: 'https://youtube.com/watch?v=123',
                    duration_minutes: 10,
                    storage_path: null,
                    thumbnail_url: null,
                    content_label: null,
                    order_index: 2,
                    created_at: '2024-01-01T00:00:00Z',
                    updated_at: '2024-01-01T00:00:00Z',
                  },
                  {
                    id: 'content-3',
                    chapter_id: 'chapter-2',
                    content_type: 'pdf',
                    title: 'Chapter 2 PDF',
                    content_text: null,
                    content_url: 'https://storage.example.com/file.pdf',
                    duration_minutes: null,
                    storage_path: 'courses/test-course-id/chapters/chapter-2/materials/file.pdf',
                    thumbnail_url: null,
                    content_label: null,
                    order_index: 1,
                    created_at: '2024-01-01T00:00:00Z',
                    updated_at: '2024-01-01T00:00:00Z',
                  },
                ],
                error: null,
              })),
            })),
          })),
        };
      }
      if (table === 'assignments') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({
              data: [
                {
                  id: 'assignment-1',
                  course_id: 'test-course-id',
                  title: 'Chapter 1 Assignment',
                  description: 'Test assignment',
                  assignment_type: 'mcq',
                  max_marks: 100,
                  config: JSON.stringify({ chapter_id: 'chapter-1', auto_grading_enabled: true }),
                  is_published: true,
                  created_by: 'admin-id',
                },
              ],
              error: null,
            })),
          })),
        };
      }
      if (table === 'assignment_questions') {
        return {
          select: vi.fn(() => ({
            in: vi.fn(() => ({
              order: vi.fn(() => Promise.resolve({
                data: [
                  {
                    id: 'question-1',
                    assignment_id: 'assignment-1',
                    question_text: 'What is 2+2?',
                    question_type: 'MCQ',
                    options: ['2', '3', '4', '5'],
                    correct_answer: '4',
                    points: 10,
                    order_index: 1,
                    created_at: '2024-01-01T00:00:00Z',
                  },
                ],
                error: null,
              })),
            })),
          })),
        };
      }
      if (table === 'course_access') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({
              data: [
                {
                  id: 'access-1',
                  course_id: 'test-course-id',
                  school_id: 'school-1',
                  grade: 'Grade 1',
                },
              ],
              error: null,
            })),
          })),
        };
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
      };
    }),
  },
}));

vi.mock('../../../../../../lib/rate-limit', () => ({
  rateLimit: vi.fn(() => Promise.resolve({ success: true })),
  RateLimitPresets: { READ: {} },
  createRateLimitHeaders: vi.fn(() => ({})),
}));

vi.mock('../../../../../../lib/cache', () => ({
  getOrSetCache: vi.fn((key, fn) => fn()),
  CacheKeys: {
    courseMetadata: (id: string) => `course:metadata:${id}`,
  },
}));

vi.mock('../../../../../../lib/auth-utils', () => ({
  verifyAdmin: vi.fn(() => Promise.resolve({ 
    success: true, 
    userId: 'admin-id',
    response: null as any // Not used when success is true
  })),
}));

describe('GET /api/admin/courses/[id] - Chapters and Contents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch course with chapters', async () => {
    const request = new NextRequest('http://localhost:3000/api/admin/courses/test-course-id', {
      headers: {
        'authorization': 'Bearer test-token',
      },
    });
    
    // Mock CSRF validation (not needed for GET requests)
    vi.doMock('../../../../../../lib/csrf-middleware', () => ({
      validateCsrf: vi.fn(() => null),
      ensureCsrfToken: vi.fn(),
    }));

    const response = await GET(request, { params: { id: 'test-course-id' } });
    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(data.course).toBeDefined();
    expect(data.course.chapters).toBeDefined();
    expect(Array.isArray(data.course.chapters)).toBe(true);
    expect(data.course.chapters.length).toBe(2);
  });

  it('should include chapter contents nested in chapters', async () => {
    const request = new NextRequest('http://localhost:3000/api/admin/courses/test-course-id', {
      headers: {
        'authorization': 'Bearer test-token',
      },
    });
    
    vi.doMock('../../../../../../lib/csrf-middleware', () => ({
      validateCsrf: vi.fn(() => null),
      ensureCsrfToken: vi.fn(),
    }));

    const response = await GET(request, { params: { id: 'test-course-id' } });
    expect(response.status).toBe(200);
    const data = await response.json();
    
    // Check that chapters have contents array
    const chapter1 = data.course.chapters.find((ch: any) => ch.id === 'chapter-1');
    expect(chapter1).toBeDefined();
    expect(chapter1.contents).toBeDefined();
    expect(Array.isArray(chapter1.contents)).toBe(true);
    expect(chapter1.contents.length).toBe(2);
    
    // Verify content structure
    const textContent = chapter1.contents.find((c: any) => c.content_type === 'text');
    expect(textContent).toBeDefined();
    expect(textContent.title).toBe('Introduction Text');
    expect(textContent.content_text).toBe('This is the introduction text');
    
    const videoContent = chapter1.contents.find((c: any) => c.content_type === 'video_link');
    expect(videoContent).toBeDefined();
    expect(videoContent.title).toBe('Introduction Video');
    expect(videoContent.content_url).toBe('https://youtube.com/watch?v=123');
    expect(videoContent.duration_minutes).toBe(10);
  });

  it('should include top-level chapter_contents array', async () => {
    const request = new NextRequest('http://localhost:3000/api/admin/courses/test-course-id', {
      headers: {
        'authorization': 'Bearer test-token',
      },
    });
    
    vi.doMock('../../../../../../lib/csrf-middleware', () => ({
      validateCsrf: vi.fn(() => null),
      ensureCsrfToken: vi.fn(),
    }));

    const response = await GET(request, { params: { id: 'test-course-id' } });
    expect(response.status).toBe(200);
    const data = await response.json();
    
    // Check top-level chapter_contents
    expect(data.course.chapter_contents).toBeDefined();
    expect(Array.isArray(data.course.chapter_contents)).toBe(true);
    expect(data.course.chapter_contents.length).toBe(3);
    
    // Verify content has all required fields
    const pdfContent = data.course.chapter_contents.find((c: any) => c.content_type === 'pdf');
    expect(pdfContent).toBeDefined();
    expect(pdfContent.id).toBe('content-3');
    expect(pdfContent.chapter_id).toBe('chapter-2');
    expect(pdfContent.title).toBe('Chapter 2 PDF');
    expect(pdfContent.storage_path).toBe('courses/test-course-id/chapters/chapter-2/materials/file.pdf');
  });

  it('should map chapter_contents to correct chapters', async () => {
    const request = new NextRequest('http://localhost:3000/api/admin/courses/test-course-id', {
      headers: {
        'authorization': 'Bearer test-token',
      },
    });
    
    vi.doMock('../../../../../../lib/csrf-middleware', () => ({
      validateCsrf: vi.fn(() => null),
      ensureCsrfToken: vi.fn(),
    }));

    const response = await GET(request, { params: { id: 'test-course-id' } });
    expect(response.status).toBe(200);
    const data = await response.json();
    
    // Verify chapter 1 has 2 contents
    const chapter1 = data.course.chapters.find((ch: any) => ch.id === 'chapter-1');
    expect(chapter1.contents.length).toBe(2);
    expect(chapter1.contents.every((c: any) => c.chapter_id === 'chapter-1')).toBe(true);
    
    // Verify chapter 2 has 1 content
    const chapter2 = data.course.chapters.find((ch: any) => ch.id === 'chapter-2');
    expect(chapter2.contents.length).toBe(1);
    expect(chapter2.contents[0].chapter_id).toBe('chapter-2');
  });

  it('should include all required content fields', async () => {
    const request = new NextRequest('http://localhost:3000/api/admin/courses/test-course-id', {
      headers: {
        'authorization': 'Bearer test-token',
      },
    });
    
    vi.doMock('../../../../../../lib/csrf-middleware', () => ({
      validateCsrf: vi.fn(() => null),
      ensureCsrfToken: vi.fn(),
    }));

    const response = await GET(request, { params: { id: 'test-course-id' } });
    expect(response.status).toBe(200);
    const data = await response.json();
    
    const content = data.course.chapter_contents[0];
    const requiredFields = [
      'id',
      'content_id',
      'chapter_id',
      'content_type',
      'title',
      'content_url',
      'content_text',
      'duration_minutes',
      'storage_path',
      'thumbnail_url',
      'content_label',
      'order_index',
    ];
    
    requiredFields.forEach(field => {
      expect(content).toHaveProperty(field);
    });
  });

  it('should handle courses with no chapters', async () => {
    // Mock empty chapters
    const { supabaseAdmin } = await import('../../../../../../lib/supabase');
    vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
      if (table === 'chapters') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => Promise.resolve({ data: [], error: null })),
            })),
          })),
        };
      }
      return vi.mocked(supabaseAdmin.from)(table);
    });

    const request = new NextRequest('http://localhost:3000/api/admin/courses/test-course-id', {
      headers: {
        'authorization': 'Bearer test-token',
      },
    });
    
    vi.doMock('../../../../../../lib/csrf-middleware', () => ({
      validateCsrf: vi.fn(() => null),
      ensureCsrfToken: vi.fn(),
    }));

    const response = await GET(request, { params: { id: 'test-course-id' } });
    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(data.course.chapters).toBeDefined();
    expect(Array.isArray(data.course.chapters)).toBe(true);
    expect(data.course.chapters.length).toBe(0);
  });
});

