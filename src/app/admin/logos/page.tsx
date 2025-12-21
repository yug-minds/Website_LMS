"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Badge } from "../../../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import { Edit, Trash2, Upload, Eye, RefreshCw, Image as ImageIcon, Shield } from "lucide-react";
import { withCsrfToken } from "../../../lib/csrf-client";
import { getAuthenticatedFetch } from "../../../lib/api-client";

interface LogoItem {
  id: string;
  school_name: string;
  description?: string | null;
  image_url: string;
  upload_date?: string;
}

export default function LogoManagementPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [logos, setLogos] = useState<LogoItem[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [activeTab, setActiveTab] = useState("manage");

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadSchoolName, setUploadSchoolName] = useState("");
  const [uploadDescription, setUploadDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const totalPages = useMemo(() => Math.ceil(total / limit), [total, limit]);
  const currentPage = useMemo(() => Math.floor(offset / limit) + 1, [offset, limit]);

  const fetchLogos = async () => {
    try {
      setLoading(true);
      const authedFetch = await getAuthenticatedFetch();
      const res = await authedFetch(`/api/admin/logos?limit=${limit}&offset=${offset}`, { cache: "no-store", credentials: 'include' });
      const data = await res.json();
      if (res.ok) {
        setLogos(data.data || []);
        setTotal(data.total || 0);
      } else {
        alert(data.error || "Failed to load logos");
      }
    } catch (e: any) {
      alert(e?.message || "Failed to load logos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogos();
  }, [limit, offset]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setPreviewUrl(f ? URL.createObjectURL(f) : null);
  };

  const validateFileClient = async (f: File): Promise<{ ok: boolean; error?: string; dims?: { w: number; h: number } }> => {
    if (!f) return { ok: false, error: "No file selected" };
    if (!['image/png', 'image/jpeg', 'image/svg+xml'].includes(f.type)) return { ok: false, error: 'Only JPG, PNG, SVG allowed' };
    if (f.size > 2 * 1024 * 1024) return { ok: false, error: 'Max file size is 2MB' };
    const dims = await new Promise<{ w: number; h: number } | null>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.width, h: img.height });
      img.onerror = () => resolve(null);
      img.src = URL.createObjectURL(f);
    });
    if (!dims || dims.w < 300 || dims.h < 300) return { ok: false, error: 'Minimum dimensions 300x300px' };
    return { ok: true, dims };
  };

  const handleUpload = async () => {
    if (!file) { alert('Select a logo file'); return; }
    if (!uploadSchoolName.trim()) { alert('Enter school name'); return; }
    const v = await validateFileClient(file);
    if (!v.ok) { alert(v.error); return; }

    try {
      setUploading(true);
      const fd = new FormData();
      fd.append('file', file);
      fd.append('school_name', uploadSchoolName.trim());
      if (uploadDescription.trim()) fd.append('description', uploadDescription.trim());
      const authedFetch = await getAuthenticatedFetch();
      const options = await withCsrfToken({ method: 'POST', body: fd });
      const res = await authedFetch('/api/admin/logos', options);
      const data = await res.json();
      if (res.ok) {
        alert('Logo uploaded');
        setFile(null);
        setPreviewUrl(null);
        setUploadSchoolName('');
        setUploadDescription('');
        setOffset(0);
        fetchLogos();
      } else {
        alert(data.error || 'Upload failed');
      }
    } catch (e: any) {
      alert(e?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleReplace = async (id: string, f: File) => {
    const v = await validateFileClient(f);
    if (!v.ok) { alert(v.error); return; }
    try {
      setActionLoadingId(id);
      const fd = new FormData();
      fd.append('replace_image', 'true');
      fd.append('file', f);
      const authedFetch = await getAuthenticatedFetch();
      const options = await withCsrfToken({ method: 'PUT', body: fd });
      const res = await authedFetch(`/api/admin/logos/${id}`, options);
      const data = await res.json();
      if (res.ok) {
        alert('Logo replaced');
        fetchLogos();
      } else {
        alert(data.error || 'Replace failed');
      }
    } catch (e: any) {
      alert(e?.message || 'Replace failed');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDelete = async (id: string, hard: boolean = false) => {
    try {
      if (!confirm(hard ? 'Permanently delete this logo?' : 'Soft delete this logo?')) return;
      setActionLoadingId(id);
      const authedFetch = await getAuthenticatedFetch();
      const options = await withCsrfToken({ method: 'DELETE' });
      const res = await authedFetch(`/api/admin/logos/${id}?hard=${hard ? 'true' : 'false'}`, options);
      const data = await res.json();
      if (res.ok) {
        alert('Logo deleted');
        fetchLogos();
      } else {
        alert(data.error || 'Delete failed');
      }
    } catch (e: any) {
      alert(e?.message || 'Delete failed');
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">School Logo Management</h1>
          <p className="text-gray-600 mt-1">Upload, view, edit, and delete school logos</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="manage">Manage Logos</TabsTrigger>
          <TabsTrigger value="upload">Upload New</TabsTrigger>
        </TabsList>

        <TabsContent value="upload">
          <Card className="bg-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5" /> Upload Logo</CardTitle>
              <CardDescription>JPG, PNG, SVG. Max 2MB. Min 300x300px.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <section className="grid md:grid-cols-2 gap-6">
                <div>
                  <div className="space-y-2">
                    <Label htmlFor="school_name">School Name</Label>
                    <Input id="school_name" value={uploadSchoolName} onChange={(e) => setUploadSchoolName(e.target.value)} placeholder="e.g., Greenwood High" />
                  </div>
                  <div className="space-y-2 mt-4">
                    <Label htmlFor="description">Description (optional)</Label>
                    <Input id="description" value={uploadDescription} onChange={(e) => setUploadDescription(e.target.value)} placeholder="e.g., Official school logo" />
                  </div>
                  <div className="space-y-2 mt-4">
                    <Label htmlFor="file">Logo File</Label>
                    <Input id="file" type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={onFileChange} />
                  </div>
                  <div className="mt-6">
                    <Button onClick={handleUpload} disabled={uploading} className="w-full">
                      {uploading ? (<><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Uploading...</>) : (<><Upload className="h-4 w-4 mr-2" /> Upload</>)}
                    </Button>
                  </div>
                </div>
                <div>
                  <section className="border rounded-lg p-4 bg-gray-50">
                    <div className="flex items-center gap-2 mb-2"><ImageIcon className="h-5 w-5" /><span className="font-medium">Preview</span></div>
                    {previewUrl ? (
                      <div className="aspect-[4/1] flex items-center justify-center bg-white border rounded-lg">
                        <img src={previewUrl} alt="Preview" className="max-h-24" />
                      </div>
                    ) : (
                      <div className="h-24 flex items-center justify-center text-gray-400">No file selected</div>
                    )}
                  </section>
                </div>
              </section>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="manage">
          <Card className="bg-white">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Logos</CardTitle>
                  <CardDescription>Showing {logos.length} of {total} logos</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">Page {currentPage} / {Math.max(totalPages, 1)}</Badge>
                  <Button variant="outline" onClick={fetchLogos}><RefreshCw className="h-4 w-4 mr-2" /> Refresh</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <section className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {loading ? (
                  <div className="col-span-full py-8 text-center text-gray-500">Loading logos...</div>
                ) : logos.length === 0 ? (
                  <div className="col-span-full py-8 text-center text-gray-500">No logos found</div>
                ) : (
                  logos.map((logo) => (
                    <div key={logo.id} className="border rounded-lg p-3 group">
                      <div className="flex items-center justify-center h-20 overflow-hidden">
                        <img src={logo.image_url} alt={logo.school_name} className="max-h-16 opacity-80 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <div className="mt-2 text-sm font-medium truncate" title={logo.school_name}>{logo.school_name}</div>
                      <div className="mt-1 text-xs text-gray-500 truncate" title={logo.description || ''}>{logo.description || '—'}</div>
                      <div className="mt-3 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                        <label className="text-blue-600 hover:text-blue-700 text-xs flex items-center gap-1 cursor-pointer">
                          <Edit className="h-3 w-3" /> Replace
                          <input type="file" accept="image/png,image/jpeg,image/svg+xml" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleReplace(logo.id, f); }} />
                        </label>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700 h-7 px-2" onClick={() => handleDelete(logo.id, false)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700 h-7 px-2" onClick={() => handleDelete(logo.id, true)}>
                            <Shield className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      {actionLoadingId === logo.id && (
                        <div className="mt-2 text-xs text-gray-500 flex items-center gap-1"><RefreshCw className="h-3 w-3 animate-spin" /> Processing...</div>
                      )}
                    </div>
                  ))
                )}
              </section>

              <div className="mt-6 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Label>Per page</Label>
                  <select className="border rounded-md p-2 text-sm" value={limit} onChange={(e) => { setLimit(parseInt(e.target.value, 10)); setOffset(0); }}>
                    {[10, 20, 50].map((n: any) => (<option key={n} value={n}>{n}</option>))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>Prev</Button>
                  <Button variant="outline" disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)}>Next</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
