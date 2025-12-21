import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '../health/route';
import { NextRequest } from 'next/server';

// Mock dependencies
vi.mock('../../../lib/monitoring', () => ({
  performHealthCheck: vi.fn().mockResolvedValue({
    status: 'healthy',
    timestamp: Date.now(),
    checks: {
      database: { status: 'healthy', responseTime: 10 },
      cache: { status: 'healthy', size: 100, maxSize: 1000 },
      api: { status: 'healthy', totalRequests: 1000, errorRate: 0.01, averageResponseTime: 50 },
    },
  }),
}));

describe('Health API Route', () => {
  it('should return 200 status', async () => {
    const request = new NextRequest('http://localhost:3000/api/health');
    const response = await GET(request);
    
    expect(response.status).toBe(200);
  });

  it('should return health status in response', async () => {
    const request = new NextRequest('http://localhost:3000/api/health');
    const response = await GET(request);
    const data = await response.json();
    
    expect(data).toHaveProperty('status');
    expect(data.status).toBe('healthy');
  });
});

