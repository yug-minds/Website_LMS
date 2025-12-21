"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { 
  Plus, Search, Filter, ArrowUpDown, MoreHorizontal, 
  Edit, Trash2, Eye, EyeOff, Save, X, Image as ImageIcon,
  History, RotateCcw, Check, AlertCircle, Layout, ArrowLeft
} from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Badge } from "../../../components/ui/badge";
import { 
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle 
} from "../../../components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, 
  DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuCheckboxItem
} from "../../../components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle
} from "../../../components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "../../../components/ui/select";
import { Textarea } from "../../../components/ui/textarea";
import { Label } from "../../../components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import { withCsrfToken } from "../../../lib/csrf-client";
import { getAuthenticatedFetch } from "../../../lib/api-client";

// --- Constants ---
// Character limit for title to fit in 2 lines (for large headings text-3xl to text-6xl)
const TITLE_MAX_LENGTH = 85;

// --- Utility Functions ---
/**
 * Convert newlines to HTML <br> tags while preserving existing HTML
 * Handles both single and double newlines appropriately
 */
function convertNewlinesToBr(text: string): string {
  if (!text) return '';
  
  // Check if text already contains HTML tags
  const hasHtml = /<[^>]+>/.test(text);
  
  if (hasHtml) {
    // If HTML exists, just convert newlines to <br> tags
    // This preserves existing HTML structure
    return text.replace(/\n/g, '<br>');
  } else {
    // For plain text, convert double newlines to paragraph breaks
    // and single newlines to <br> tags
    let result = text.replace(/\n\n+/g, '</p><p>');
    result = result.replace(/\n/g, '<br>');
    // Wrap in <p> tags if we added paragraph breaks, otherwise just return with <br>
    if (result.includes('</p><p>')) {
      result = '<p>' + result + '</p>';
    }
    return result;
  }
}

// --- Types ---

interface Section {
  id: string;
  title: string;
  body_primary: string;
  body_secondary?: string | null;
  body_tertiary?: string | null;
  image_url?: string | null;
  storage_path?: string | null;
  background: 'blue' | 'white';
  image_position: 'left' | 'right';
  order_index: number;
  is_published?: boolean;
  updated_at?: string;
}

interface Version {
  id: string;
  version_number: number;
  created_at: string;
}

// --- Preview Component (Internal) ---

const PreviewSection = ({ section, imagePreview }: { section: Section; imagePreview: string | null }) => {
  const isBlue = section.background === 'blue';
  const bgClass = isBlue ? 'bg-blue-600 text-white' : 'bg-white';
  const textClass = isBlue ? 'text-white/90' : 'text-gray-700';
  const titleClass = isBlue ? 'text-white' : 'text-gray-900';

  const isVideo = Boolean(
    (section.storage_path && /\.(mp4|webm|mov|m4v|ogg|ogv)$/i.test(section.storage_path)) ||
    (imagePreview && /\.(mp4|webm|mov|m4v|ogg|ogv)(\?.*)?$/i.test(imagePreview)) ||
    (section.image_url && /\.(mp4|webm|mov|m4v|ogg|ogv)(\?.*)?$/i.test(section.image_url))
  );
  
  // Truncate title to fit in 2 lines
  const displayTitle = section.title.length > TITLE_MAX_LENGTH 
    ? section.title.substring(0, TITLE_MAX_LENGTH).trim() + '...'
    : section.title;

  const imageEl = (
    <div className="w-full flex items-start">
      <div className="bg-gray-100 rounded-lg overflow-hidden border-2 border-white shadow-lg w-full relative group">
        {imagePreview ? (
          isVideo ? (
            <video
              src={imagePreview}
              controls
              playsInline
              className="w-full h-auto object-contain rounded-lg bg-black"
              style={{ maxHeight: '400px', maxWidth: '100%' }}
            />
          ) : (
            <img 
              src={imagePreview} 
              alt={section.title} 
              className="w-full h-auto object-contain rounded-lg"
              style={{ maxHeight: '400px', maxWidth: '100%' }}
            />
          )
        ) : (
          <div className="aspect-video text-center p-8 text-gray-400 flex flex-col items-center justify-center min-h-[300px]">
            <ImageIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No Media Selected</p>
          </div>
        )}
      </div>
    </div>
  );

  // Convert newlines to <br> tags for proper display
  const bodyPrimaryHtml = section.body_primary 
    ? convertNewlinesToBr(section.body_primary)
    : '<p class="opacity-50 italic">Primary content...</p>';
  const bodySecondaryHtml = section.body_secondary 
    ? convertNewlinesToBr(section.body_secondary)
    : null;
  const bodyTertiaryHtml = section.body_tertiary
    ? convertNewlinesToBr(section.body_tertiary)
    : null;

  const textEl = (
    <div className="w-full flex items-start justify-start">
      <div className={`w-full space-y-4 text-left ${isBlue ? 'max-w-[550px]' : 'max-w-[600px]'}`}>
        <div 
          className={`${textClass} text-base leading-relaxed text-left max-w-none`}
          dangerouslySetInnerHTML={{ __html: bodyPrimaryHtml }} 
        />
        {bodySecondaryHtml && (
          <div 
            className={`${textClass} text-base leading-relaxed text-left max-w-none`}
            dangerouslySetInnerHTML={{ __html: bodySecondaryHtml }} 
          />
        )}
        {bodyTertiaryHtml && (
          <div 
            className={`${textClass} text-base leading-relaxed text-left max-w-none`}
            dangerouslySetInnerHTML={{ __html: bodyTertiaryHtml }} 
          />
        )}
      </div>
    </div>
  );

  return (
    <div className={`w-full overflow-hidden border rounded-xl shadow-sm ${bgClass}`}>
      <div className="p-8 md:p-12">
        <h2 
          className={`text-3xl md:text-4xl font-extrabold mb-10 text-left ${titleClass} max-w-5xl`}
          style={{
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
        >
          {displayTitle || <span className="opacity-50 italic">Section Title</span>}
        </h2>
        
        <div className="grid grid-cols-1 gap-10 items-start">
          {/* We use a simplified grid for preview, forcing single column on very small preview areas if needed, but trying to respect left/right */}
          <div className={`grid grid-cols-1 xl:grid-cols-2 gap-8 items-start`}>
             {section.image_position === 'left' ? (
              <>
                <div className="order-1">{imageEl}</div>
                <div className="order-2">{textEl}</div>
              </>
            ) : (
              <>
                <div className="order-2 xl:order-1">{textEl}</div>
                <div className="order-1 xl:order-2">{imageEl}</div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Main Page Component ---

export default function SuccessStoriesAdminPage() {
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'list' | 'edit'>('list');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft'>('all');
  const [sortOrder, setSortOrder] = useState<'order' | 'newest'>('order');
  
  // Edit State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Section | null>(null);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Version History State
  const [showVersions, setShowVersions] = useState(false);
  const [versions, setVersions] = useState<Version[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);

  // Bulk Actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchSections();
  }, []);

  const fetchSections = async () => {
    try {
      setLoading(true);
      const authed = await getAuthenticatedFetch();
      const res = await authed('/api/admin/success-stories');
      const data = await res.json();
      if (res.ok) {
        setSections((data.sections || []));
      } else {
        console.error("Failed to load sections", data.error);
      }
    } catch (e) {
      console.error("Error loading sections", e);
    } finally {
      setLoading(false);
    }
  };

  // Filter & Sort Logic
  const filteredSections = useMemo(() => {
    let result = [...sections];
    
    if (search) {
      const lower = search.toLowerCase();
      result = result.filter((s: any) => s.title.toLowerCase().includes(lower) || s.body_primary.toLowerCase().includes(lower));
    }

    if (statusFilter !== 'all') {
      result = result.filter((s: any) => statusFilter === 'published' ? s.is_published : !s.is_published);
    }

    if (sortOrder === 'order') {
      result.sort((a: any, b: any) => a.order_index - b.order_index);
    } else {
      result.sort((a: any, b: any) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime());
    }

    return result;
  }, [sections, search, statusFilter, sortOrder]);

  // Actions
  const handleEdit = (section: Section) => {
    setEditingId(section.id);
    setFormData({ ...section });
    setMediaPreview(section.image_url || null);
    setMediaFile(null);
    setValidationErrors({});
    setView('edit');
  };

  const handleCreate = () => {
    const newSection: Section = {
      id: '',
      title: '',
      body_primary: '',
      body_secondary: '',
      body_tertiary: '',
      background: 'white',
      image_position: 'left',
      order_index: sections.length,
      is_published: false
    };
    setEditingId('new');
    setFormData(newSection);
    setMediaPreview(null);
    setMediaFile(null);
    setValidationErrors({});
    setView('edit');
  };

  const handleBack = () => {
    if (window.confirm("Unsaved changes will be lost. Are you sure?")) {
      setView('list');
      setEditingId(null);
      setFormData(null);
    }
  };

  const handleMediaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Allow larger videos; keep images at 5MB. Videos: 100MB.
    const isVideo = file.type.startsWith('video/');
    const maxSize = isVideo ? (100 * 1024 * 1024) : (5 * 1024 * 1024);
    if (file.size > maxSize) {
      alert(`File size too large (max ${isVideo ? '100MB' : '5MB'})`);
      return;
    }

    setMediaFile(file);
    setMediaPreview(URL.createObjectURL(file));
  };

  const handleSave = async (publish = false) => {
    if (!formData) return;

    // Validate
    const errors: Record<string, string> = {};
    if (!formData.title.trim()) {
      errors.title = "Title is required";
    } else if (formData.title.length > TITLE_MAX_LENGTH) {
      errors.title = `Title must be ${TITLE_MAX_LENGTH} characters or less (currently ${formData.title.length})`;
    }
    if (!formData.body_primary.trim()) errors.body_primary = "Primary content is required";
    if (!formData.id && !mediaFile && !formData.image_url) errors.image = "Media (image/video) is required for new sections";
    
    setValidationErrors(errors);
    if (Object.keys(errors).length > 0) return;

    try {
      setIsSaving(true);
      const fd = new FormData();
      fd.append('title', formData.title);
      fd.append('body_primary', formData.body_primary);
      if (formData.body_secondary) fd.append('body_secondary', formData.body_secondary);
      if (formData.body_tertiary) fd.append('body_tertiary', formData.body_tertiary);
      fd.append('background', formData.background);
      fd.append('image_position', formData.image_position);
      fd.append('order_index', String(formData.order_index));
      if (publish) fd.append('is_published', 'true');
      else if (formData.is_published) fd.append('is_published', 'true'); // Maintain published state if not explicitly publishing

      if (mediaFile) {
        // API still expects field name "image" for backward compatibility.
        fd.append('image', mediaFile);
      }

      const authed = await getAuthenticatedFetch();
      const method = formData.id ? 'PUT' : 'POST';
      const url = formData.id ? `/api/admin/success-stories/${formData.id}` : '/api/admin/success-stories';
      
      const options = await withCsrfToken({ method, body: fd });
      const res = await authed(url, options);
      
      if (res.ok) {
        // alert("Saved successfully!");
        setView('list');
        fetchSections();
      } else {
        // Improved error handling - try to parse error response
        let errorMessage = "Failed to save";
        try {
          const contentType = res.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const data = await res.json();
            // Build a more detailed error message
            errorMessage = data.error || data.message || `Server error: ${res.status} ${res.statusText}`;
            if (data.details) {
              errorMessage += `\n\nDetails: ${data.details}`;
            }
            if (data.hint) {
              errorMessage += `\n\nHint: ${data.hint}`;
            }
            console.error('API Error Response:', {
              status: res.status,
              statusText: res.statusText,
              error: data.error,
              message: data.message,
              details: data.details,
              hint: data.hint,
              code: data.code,
              fullData: data
            });
          } else {
            const text = await res.text();
            errorMessage = text || `Server error: ${res.status} ${res.statusText}`;
            console.error('API Error Response (non-JSON):', {
              status: res.status,
              statusText: res.statusText,
              body: text
            });
          }
        } catch (parseError) {
          console.error('Error parsing error response:', parseError);
          errorMessage = `Failed to save: ${res.status} ${res.statusText}`;
        }
        alert(errorMessage);
      }
    } catch (e) {
      console.error('Error saving success story:', e);
      const errorMessage = e instanceof Error ? e.message : "An error occurred while saving";
      console.error('Full error details:', {
        error: e,
        formData: formData ? {
          id: formData.id,
          title: formData.title,
          hasBodyPrimary: !!formData.body_primary,
          hasImage: !!mediaFile || !!formData.image_url
        } : null
      });
      alert(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this section?")) return;
    try {
      const authed = await getAuthenticatedFetch();
      const options = await withCsrfToken({ method: 'DELETE' });
      await authed(`/api/admin/success-stories/${id}`, options);
      fetchSections();
    } catch (e) {
      alert("Failed to delete");
    }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selectedIds.size} stories?`)) return;
    try {
      const authed = await getAuthenticatedFetch();
      const options = await withCsrfToken({ method: 'DELETE' });
      // We need to delete one by one as the API might not support bulk delete
      // Or we can check if there is a bulk delete endpoint. 
      // Assuming standard REST, loop through.
      for (const id of Array.from(selectedIds)) {
        await authed(`/api/admin/success-stories/${id}`, options);
      }
      setSelectedIds(new Set());
      fetchSections();
      alert("Deleted selected stories");
    } catch (e) {
      alert("Failed to delete some stories");
    }
  };

  const toggleSelection = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleRevert = async (versionId: string) => {
    if (!editingId || editingId === 'new') return;
    if (!confirm("Revert to this version? Current unsaved changes will be lost.")) return;

    try {
      const authed = await getAuthenticatedFetch();
      const options = await withCsrfToken({ 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ version_id: versionId }) 
      });
      const res = await authed(`/api/admin/success-stories/${editingId}/revert`, options);
      
      if (res.ok) {
        alert("Reverted successfully");
        setShowVersions(false);
        // Reload current section
        const sectionRes = await authed(`/api/admin/success-stories`); // We fetch all for now as we don't have single fetch easily
        // Better: fetchSections() and then find the one
        await fetchSections();
        const data = await sectionRes.json();
          const updated = (data.sections || []).find((s: Section) => s.id === editingId);
        if (updated) {
          setFormData(updated);
            setMediaPreview(updated.image_url || null);
        }
      } else {
        alert("Failed to revert");
      }
    } catch (e) {
      alert("Error reverting version");
    }
  };

  const loadVersions = async () => {
    if (!editingId || editingId === 'new') return;
    setLoadingVersions(true);
    try {
      const authed = await getAuthenticatedFetch();
      const res = await authed(`/api/admin/success-stories/${editingId}/versions`);
      const data = await res.json();
      if (res.ok) setVersions(data.versions || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingVersions(false);
    }
  };

  // List View
  if (view === 'list') {
    return (
      <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Success Stories</h1>
            <p className="text-gray-500 mt-1">Manage and organize student achievements and success stories.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={handleCreate} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="h-4 w-4 mr-2" /> Add Story
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 items-center bg-white p-4 rounded-lg border shadow-sm">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input 
              placeholder="Search stories..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
            <SelectTrigger className="w-[180px]">
              <Filter className="h-4 w-4 mr-2 text-gray-400" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortOrder} onValueChange={(v: any) => setSortOrder(v)}>
            <SelectTrigger className="w-[180px]">
              <ArrowUpDown className="h-4 w-4 mr-2 text-gray-400" />
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="order">Custom Order</SelectItem>
              <SelectItem value="newest">Last Updated</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Bulk Actions Bar */}
        {selectedIds.size > 0 && (
          <div className="bg-blue-50 border border-blue-100 p-3 rounded-lg flex items-center justify-between text-blue-800">
            <span className="font-medium text-sm">{selectedIds.size} selected</span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" className="text-blue-800 hover:bg-blue-100" onClick={() => setSelectedIds(new Set())}>Cancel</Button>
              <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={handleBulkDelete}>
                <Trash2 className="h-4 w-4 mr-1" /> Delete Selected
              </Button>
            </div>
          </div>
        )}

        {/* Content List */}
        <div className="grid gap-4">
          {loading ? (
            <div className="text-center py-20 text-gray-500">Loading stories...</div>
          ) : filteredSections.length === 0 ? (
            <div className="text-center py-20 bg-gray-50 rounded-xl border border-dashed">
              <div className="text-gray-500 font-medium">No stories found</div>
              <p className="text-sm text-gray-400 mt-1">Try adjusting your filters or create a new story.</p>
              <Button variant="outline" className="mt-4" onClick={handleCreate}>Create Story</Button>
            </div>
          ) : (
            filteredSections.map((section) => (
              <Card key={section.id} className={`overflow-hidden group hover:shadow-md transition-shadow relative ${selectedIds.has(section.id) ? 'ring-2 ring-blue-500' : ''}`}>
                <div className="absolute top-2 right-2 z-10">
                   <input 
                    type="checkbox" 
                    className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 shadow-sm cursor-pointer bg-white"
                    checked={selectedIds.has(section.id)}
                    onChange={() => toggleSelection(section.id)}
                   />
                </div>
                <div className="flex flex-col md:flex-row">
                  {/* Thumbnail */}
                  <div className="w-full md:w-48 h-32 bg-gray-100 relative shrink-0">
                    {section.image_url ? (
                      /\.(mp4|webm|mov|m4v|ogg|ogv)(\?.*)?$/i.test(section.image_url) ? (
                        <video
                          src={section.image_url}
                          className="w-full h-full object-cover bg-black"
                          muted
                          playsInline
                        />
                      ) : (
                        <img src={section.image_url} alt="" className="w-full h-full object-cover" />
                      )
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                        <ImageIcon className="h-8 w-8 opacity-20" />
                      </div>
                    )}
                    <div className="absolute top-2 left-2">
                      <Badge variant={section.is_published ? "default" : "secondary"} className={section.is_published ? "bg-green-600" : ""}>
                        {section.is_published ? "Published" : "Draft"}
                      </Badge>
                    </div>
                  </div>
                  
                  {/* Content */}
                  <div className="p-4 flex-1 flex flex-col justify-between">
                    <div>
                      <h3 className="font-bold text-lg text-gray-900">{section.title}</h3>
                      <p className="text-sm text-gray-500 line-clamp-2 mt-1">
                        {section.body_primary.replace(/<[^>]*>/g, '').substring(0, 150)}...
                      </p>
                    </div>
                    <div className="flex items-center justify-between mt-4">
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <Layout className="h-3 w-3" />
                        <span>{section.background === 'blue' ? 'Blue Theme' : 'White Theme'}</span>
                        <span>•</span>
                        <span>Img: {section.image_position}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="ghost" onClick={() => handleEdit(section)}>
                          <Edit className="h-4 w-4 mr-1" /> Edit
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEdit(section)}>Edit</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDelete(section.id)} className="text-red-600">Delete</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      </div>
    );
  }

  // Edit View
  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Editor Header */}
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setView('list')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="font-bold text-lg">{editingId === 'new' ? 'New Success Story' : 'Edit Story'}</h1>
            <p className="text-xs text-gray-500">{formData?.is_published ? 'Published' : 'Draft'} • {formData?.id || 'Unsaved'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {editingId !== 'new' && (
            <Button variant="ghost" size="sm" onClick={() => { setShowVersions(true); loadVersions(); }}>
              <History className="h-4 w-4 mr-2" /> History
            </Button>
          )}
          <Button variant="outline" onClick={() => handleSave(false)} disabled={isSaving}>
            <Save className="h-4 w-4 mr-2" /> Save Draft
          </Button>
          <Button onClick={() => handleSave(true)} disabled={isSaving} className="bg-blue-600 hover:bg-blue-700">
            <Eye className="h-4 w-4 mr-2" /> Publish
          </Button>
        </div>
      </header>

      {/* Split View Content */}
      <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
        {/* Form Panel (Left) */}
        <div className="w-full md:w-[450px] lg:w-[500px] bg-white border-r overflow-y-auto p-6 space-y-6 shadow-[4px_0_24px_rgba(0,0,0,0.02)] z-1">
          
          <div className="space-y-4">
            <h3 className="font-semibold text-gray-900 border-b pb-2">Content</h3>
            
            <div className="space-y-2">
              <Label htmlFor="title">Headline</Label>
              <Input 
                id="title"
                value={formData?.title || ''} 
                onChange={e => setFormData(prev => prev ? ({...prev, title: e.target.value}) : null)}
                placeholder="e.g. Student Achievements"
                className={validationErrors.title ? "border-red-500" : ""}
                maxLength={TITLE_MAX_LENGTH}
              />
              <div className="flex items-center justify-between">
                <p className={`text-xs ${(formData?.title.length || 0) > TITLE_MAX_LENGTH ? 'text-red-500' : 'text-gray-400'}`}>
                  {(formData?.title.length || 0)} / {TITLE_MAX_LENGTH} characters (max 2 lines)
                </p>
                {(formData?.title.length || 0) > TITLE_MAX_LENGTH && (
                  <p className="text-xs text-red-500 font-medium">Exceeds limit!</p>
                )}
              </div>
              {validationErrors.title && <p className="text-xs text-red-500">{validationErrors.title}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="body_primary">Primary Text (HTML allowed)</Label>
              <Textarea 
                id="body_primary"
                value={formData?.body_primary || ''} 
                onChange={e => setFormData(prev => prev ? ({...prev, body_primary: e.target.value}) : null)}
                placeholder="Main paragraph..."
                className={`min-h-[150px] ${validationErrors.body_primary ? "border-red-500" : ""}`}
              />
              <p className="text-xs text-gray-400">Supports basic HTML tags like &lt;b&gt;, &lt;i&gt;, &lt;br&gt;</p>
              {validationErrors.body_primary && <p className="text-xs text-red-500">{validationErrors.body_primary}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="body_secondary">Secondary Text (Optional)</Label>
              <Textarea 
                id="body_secondary"
                value={formData?.body_secondary || ''} 
                onChange={e => setFormData(prev => prev ? ({...prev, body_secondary: e.target.value}) : null)}
                placeholder="Additional details..."
                className="min-h-[100px]"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="body_tertiary">Third Text (Optional)</Label>
              <Textarea 
                id="body_tertiary"
                value={formData?.body_tertiary || ''} 
                onChange={e => setFormData(prev => prev ? ({...prev, body_tertiary: e.target.value}) : null)}
                placeholder="More details..."
                className="min-h-[100px]"
              />
            </div>
          </div>

          <div className="space-y-4 pt-4">
            <h3 className="font-semibold text-gray-900 border-b pb-2">Appearance</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Theme</Label>
                <Select value={formData?.background} onValueChange={(v: any) => setFormData(prev => prev ? ({...prev, background: v}) : null)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="white">White Background</SelectItem>
                    <SelectItem value="blue">Blue Background</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Image Layout</Label>
                <Select value={formData?.image_position} onValueChange={(v: any) => setFormData(prev => prev ? ({...prev, image_position: v}) : null)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="left">Image Left</SelectItem>
                    <SelectItem value="right">Image Right</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Featured Media</Label>
              <div className="border-2 border-dashed border-gray-200 rounded-lg p-6 flex flex-col items-center justify-center text-center hover:bg-gray-50 transition-colors cursor-pointer relative">
                <input 
                  type="file" 
                  accept="image/*,video/*" 
                  onChange={handleMediaChange}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <ImageIcon className="h-8 w-8 text-gray-400 mb-2" />
                <p className="text-sm font-medium text-gray-700">Click to upload image or video</p>
                <p className="text-xs text-gray-500 mt-1">Images up to 5MB • Videos up to 100MB</p>
              </div>
              {validationErrors.image && <p className="text-xs text-red-500">{validationErrors.image}</p>}
            </div>

            <div className="space-y-2">
              <Label>Ordering</Label>
              <Input 
                type="number" 
                value={formData?.order_index || 0}
                onChange={e => setFormData(prev => prev ? ({...prev, order_index: parseInt(e.target.value) || 0}) : null)}
              />
              <p className="text-xs text-gray-400">Lower numbers appear first</p>
            </div>
          </div>
        </div>

        {/* Preview Panel (Right) */}
        <div className="flex-1 bg-gray-100 overflow-y-auto p-4 md:p-8 md:pl-12">
          <div className="max-w-6xl mx-auto space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Live Preview</h2>
              <Badge variant="outline" className="bg-white">Desktop View</Badge>
            </div>
            
            {/* The actual preview component */}
            {formData && (
              <PreviewSection section={formData} imagePreview={mediaPreview} />
            )}

            <div className="mt-8 text-center text-gray-400 text-sm">
              <p>This is how the section will appear on the public page.</p>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={showVersions} onOpenChange={setShowVersions}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Version History</DialogTitle>
            <DialogDescription>Select a version to revert to.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-[300px] overflow-y-auto">
            {loadingVersions ? (
              <div className="text-center py-4 text-gray-500">Loading versions...</div>
            ) : versions.length === 0 ? (
              <div className="text-center py-4 text-gray-500">No versions found</div>
            ) : (
              versions.map((v) => (
                <div key={v.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                  <div>
                    <div className="font-medium">Version {v.version_number}</div>
                    <div className="text-xs text-gray-500">{new Date(v.created_at).toLocaleString()}</div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => handleRevert(v.id)}>
                    <RotateCcw className="h-3 w-3 mr-2" /> Revert
                  </Button>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowVersions(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
