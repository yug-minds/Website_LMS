"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Badge } from "../../../components/ui/badge";
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from "../../../components/ui/tabs";
import { 
  Activity,
  AlertCircle,
  Clock,
  Download,
  RefreshCw,
  TrendingUp,
  Server,
  CheckCircle,
  XCircle,
  BarChart3,
  LineChart as LineChartIcon
} from "lucide-react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Legend
} from "recharts";

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#FF6B6B'];

interface ApiMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  requestsByEndpoint: Record<string, number>;
  errorsByEndpoint: Record<string, number>;
}

interface PerformanceMetric {
  endpoint: string;
  method: string;
  duration: number;
  statusCode: number;
  timestamp: number;
  userId?: string;
  error?: string;
}

export default function MonitoringDashboard() {
  const [metrics, setMetrics] = useState<ApiMetrics>({
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    averageResponseTime: 0,
    requestsByEndpoint: {},
    errorsByEndpoint: {}
  });
  const [recentMetrics, setRecentMetrics] = useState<PerformanceMetric[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const loadMetrics = useCallback(async () => {
    setIsLoading(true);
    try {
      const timestamp = new Date().getTime();
      
      // Fetch aggregated metrics
      const metricsResponse = await fetch(`/api/metrics?t=${timestamp}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache'
        }
      });

      if (!metricsResponse.ok) {
        console.error('Failed to load metrics');
        setIsLoading(false);
        return;
      }

      const metricsData = await metricsResponse.json();
      setMetrics(metricsData);

      // Fetch recent metrics
      const recentResponse = await fetch(`/api/metrics?recent=50&t=${timestamp}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache'
        }
      });

      if (recentResponse.ok) {
        const recentData = await recentResponse.json();
        if (recentData.recent) {
          setRecentMetrics(recentData.recent);
        }
      }

      console.log('✅ Metrics loaded successfully:', metricsData);
    } catch (error) {
      console.error('Error loading metrics:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (autoRefresh) {
      interval = setInterval(() => {
        loadMetrics();
      }, 5000); // Refresh every 5 seconds
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh, loadMetrics]);

  const exportMetrics = async () => {
    try {
      const data = {
        metrics,
        recentMetrics,
        exportedAt: new Date().toISOString()
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `metrics-${new Date().toISOString()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting metrics:', error);
    }
  };

  // Transform data for charts
  const endpointData = Object.entries(metrics.requestsByEndpoint || {})
    .map(([endpoint, count]) => ({
      endpoint: endpoint.length > 30 ? endpoint.substring(0, 30) + '...' : endpoint,
      requests: count,
      errors: metrics.errorsByEndpoint[endpoint] || 0,
      successRate: count > 0 ? ((count - (metrics.errorsByEndpoint[endpoint] || 0)) / count * 100).toFixed(1) : 100
    }))
    .sort((a: any, b: any) => b.requests - a.requests)
    .slice(0, 10); // Top 10 endpoints

  const errorRate = metrics.totalRequests > 0 
    ? (metrics.failedRequests / metrics.totalRequests * 100).toFixed(2)
    : '0.00';

  const successRate = metrics.totalRequests > 0 
    ? (metrics.successfulRequests / metrics.totalRequests * 100).toFixed(2)
    : '100.00';

  // Prepare time series data from recent metrics
  const timeSeriesData = recentMetrics
    .slice(-20)
    .map((metric: any) => ({
      time: new Date(metric.timestamp).toLocaleTimeString(),
      duration: metric.duration,
      statusCode: metric.statusCode,
      endpoint: metric.endpoint.split('/').pop() || metric.endpoint
    }));

  // Status code distribution
  const statusCodeData = recentMetrics.reduce((acc: Record<string, number>, metric: any) => {
    const code = Math.floor(metric.statusCode / 100) * 100;
    const key = `${code}xx`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const statusCodeChartData = Object.entries(statusCodeData).map(([code, count]) => ({
    name: code,
    value: count
  }));

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">System Monitoring</h1>
            <p className="text-gray-600 mt-2">Real-time API performance and system health metrics</p>
          </div>
          <div className="flex space-x-2">
            <Button 
              variant={autoRefresh ? "default" : "outline"}
              onClick={() => setAutoRefresh(!autoRefresh)}
            >
              <Activity className={`mr-2 h-4 w-4 ${autoRefresh ? 'animate-pulse' : ''}`} />
              {autoRefresh ? 'Auto-Refresh ON' : 'Auto-Refresh OFF'}
            </Button>
            <Button 
              variant="outline" 
              onClick={() => loadMetrics()}
              disabled={isLoading}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              {isLoading ? 'Loading...' : 'Refresh'}
            </Button>
            <Button variant="outline" onClick={exportMetrics}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </div>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isLoading ? '...' : metrics.totalRequests.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">
              All API requests tracked
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {isLoading ? '...' : `${successRate}%`}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {metrics.successfulRequests.toLocaleString()} successful
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Error Rate</CardTitle>
            <XCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {isLoading ? '...' : `${errorRate}%`}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {metrics.failedRequests.toLocaleString()} failed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Response Time</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? '...' : `${metrics.averageResponseTime.toFixed(0)}ms`}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Average across all endpoints
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Monitoring Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="endpoints">Endpoints</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="recent">Recent Activity</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Response Time Trend */}
            <Card>
              <CardHeader>
                <CardTitle>Response Time Trend</CardTitle>
                <CardDescription>Recent API response times over time</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center justify-center h-[300px]">
                    <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : timeSeriesData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={timeSeriesData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="time" />
                      <YAxis />
                      <Tooltip />
                      <Line 
                        type="monotone" 
                        dataKey="duration" 
                        stroke="#0088FE" 
                        strokeWidth={2}
                        name="Response Time (ms)"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[300px] text-gray-500">
                    <div className="text-center">
                      <LineChartIcon className="h-12 w-12 mx-auto mb-2 text-gray-400" />
                      <p>No data available yet</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Status Code Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Status Code Distribution</CardTitle>
                <CardDescription>HTTP status codes from recent requests</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center justify-center h-[300px]">
                    <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : statusCodeChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <RechartsPieChart>
                      <Pie
                        data={statusCodeChartData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, value }) => `${name}: ${value}`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {statusCodeChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[300px] text-gray-500">
                    <div className="text-center">
                      <BarChart3 className="h-12 w-12 mx-auto mb-2 text-gray-400" />
                      <p>No status code data available</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* System Health Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>System Health</CardTitle>
                <CardDescription>Overall system status</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-3xl font-bold text-green-600">
                      {parseFloat(successRate) >= 95 ? 'Healthy' : parseFloat(successRate) >= 90 ? 'Degraded' : 'Unhealthy'}
                    </div>
                    <p className="text-sm text-gray-600 mt-2">
                      {parseFloat(successRate) >= 95 
                        ? 'System operating normally' 
                        : parseFloat(successRate) >= 90 
                        ? 'Some issues detected' 
                        : 'Critical issues detected'}
                    </p>
                  </div>
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
                    parseFloat(successRate) >= 95 ? 'bg-green-100' : parseFloat(successRate) >= 90 ? 'bg-yellow-100' : 'bg-red-100'
                  }`}>
                    {parseFloat(successRate) >= 95 ? (
                      <CheckCircle className="h-8 w-8 text-green-600" />
                    ) : (
                      <AlertCircle className="h-8 w-8 text-yellow-600" />
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Performance Score</CardTitle>
                <CardDescription>Based on response times</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-blue-600">
                  {metrics.averageResponseTime < 200 ? 'Excellent' : 
                   metrics.averageResponseTime < 500 ? 'Good' : 
                   metrics.averageResponseTime < 1000 ? 'Fair' : 'Poor'}
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  Avg: {metrics.averageResponseTime.toFixed(0)}ms
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Error Rate</CardTitle>
                <CardDescription>Failed requests percentage</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-red-600">
                  {errorRate}%
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  {metrics.failedRequests} failed requests
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Endpoints Tab */}
        <TabsContent value="endpoints" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Top Endpoints by Request Volume</CardTitle>
              <CardDescription>Most frequently accessed API endpoints</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center h-[400px]">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : endpointData.length > 0 ? (
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={endpointData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="endpoint" type="category" width={150} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="requests" fill="#0088FE" name="Total Requests" />
                    <Bar dataKey="errors" fill="#FF8042" name="Errors" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[400px] text-gray-500">
                  <div className="text-center">
                    <BarChart3 className="h-12 w-12 mx-auto mb-2 text-gray-400" />
                    <p>No endpoint data available yet</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Endpoint Details Table */}
          <Card>
            <CardHeader>
              <CardTitle>Endpoint Details</CardTitle>
              <CardDescription>Detailed metrics for each endpoint</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Endpoint</th>
                      <th className="text-right p-2">Requests</th>
                      <th className="text-right p-2">Errors</th>
                      <th className="text-right p-2">Success Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {endpointData.length > 0 ? (
                      endpointData.map((item, index) => (
                        <tr key={index} className="border-b hover:bg-gray-50">
                          <td className="p-2 font-mono text-sm">{item.endpoint}</td>
                          <td className="text-right p-2">{item.requests.toLocaleString()}</td>
                          <td className="text-right p-2">
                            <Badge variant={item.errors > 0 ? "destructive" : "default"}>
                              {item.errors}
                            </Badge>
                          </td>
                          <td className="text-right p-2">
                            <Badge variant={parseFloat(String(item.successRate)) >= 95 ? "default" : "secondary"}>
                              {item.successRate}%
                            </Badge>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="text-center p-8 text-gray-500">
                          No endpoint data available
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="performance" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Performance Metrics</CardTitle>
              <CardDescription>Response time analysis and trends</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center h-[400px]">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : timeSeriesData.length > 0 ? (
                <ResponsiveContainer width="100%" height={400}>
                  <AreaChart data={timeSeriesData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" />
                    <YAxis />
                    <Tooltip />
                    <Area 
                      type="monotone" 
                      dataKey="duration" 
                      stroke="#0088FE" 
                      fill="#0088FE" 
                      fillOpacity={0.3}
                      name="Response Time (ms)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[400px] text-gray-500">
                  <div className="text-center">
                    <TrendingUp className="h-12 w-12 mx-auto mb-2 text-gray-400" />
                    <p>No performance data available yet</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Response Time Distribution</CardTitle>
                <CardDescription>Distribution of response times</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Fast (&lt; 200ms)</span>
                    <Badge variant="default" className="bg-green-100 text-green-800">
                      {recentMetrics.filter((m: any) => m.duration < 200).length}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Normal (200-500ms)</span>
                    <Badge variant="default" className="bg-blue-100 text-blue-800">
                      {recentMetrics.filter((m: any) => m.duration >= 200 && m.duration < 500).length}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Slow (500-1000ms)</span>
                    <Badge variant="default" className="bg-yellow-100 text-yellow-800">
                      {recentMetrics.filter((m: any) => m.duration >= 500 && m.duration < 1000).length}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Very Slow (&gt; 1000ms)</span>
                    <Badge variant="default" className="bg-red-100 text-red-800">
                      {recentMetrics.filter((m: any) => m.duration >= 1000).length}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Performance Summary</CardTitle>
                <CardDescription>Key performance indicators</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Average Response Time</span>
                    <span className="text-lg font-bold">{metrics.averageResponseTime.toFixed(0)}ms</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Min Response Time</span>
                    <span className="text-lg font-bold">
                      {recentMetrics.length > 0 ? Math.min(...recentMetrics.map((m: any) => m.duration)).toFixed(0) : '0'}ms
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Max Response Time</span>
                    <span className="text-lg font-bold">
                      {recentMetrics.length > 0 ? Math.max(...recentMetrics.map((m: any) => m.duration)).toFixed(0) : '0'}ms
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Total Requests</span>
                    <span className="text-lg font-bold">{metrics.totalRequests.toLocaleString()}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Recent Activity Tab */}
        <TabsContent value="recent" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Recent API Activity</CardTitle>
              <CardDescription>Last 50 API requests with detailed information</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Time</th>
                      <th className="text-left p-2">Endpoint</th>
                      <th className="text-left p-2">Method</th>
                      <th className="text-right p-2">Duration</th>
                      <th className="text-center p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentMetrics.length > 0 ? (
                      recentMetrics.slice().reverse().map((metric, index) => (
                        <tr key={index} className="border-b hover:bg-gray-50">
                          <td className="p-2 text-sm text-gray-600">
                            {new Date(metric.timestamp).toLocaleTimeString()}
                          </td>
                          <td className="p-2 font-mono text-sm">
                            {metric.endpoint.length > 40 ? metric.endpoint.substring(0, 40) + '...' : metric.endpoint}
                          </td>
                          <td className="p-2">
                            <Badge variant="outline">{metric.method}</Badge>
                          </td>
                          <td className="text-right p-2">
                            <span className={metric.duration > 1000 ? 'text-red-600 font-medium' : 
                                           metric.duration > 500 ? 'text-yellow-600' : 'text-green-600'}>
                              {metric.duration}ms
                            </span>
                          </td>
                          <td className="text-center p-2">
                            <Badge 
                              variant={metric.statusCode >= 500 ? "destructive" : 
                                      metric.statusCode >= 400 ? "secondary" : "default"}
                            >
                              {metric.statusCode}
                            </Badge>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="text-center p-8 text-gray-500">
                          No recent activity data available
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

