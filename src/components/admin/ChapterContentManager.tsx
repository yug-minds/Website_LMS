"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Badge } from "../ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { 
  Plus, 
  Edit, 
  Trash2, 
  Video, 
  FileText, 
  Link, 
  Image,
  File,
  GripVertical,
  X
} from "lucide-react";
import { FileUploadZone } from "./FileUploadZone";

export interface ChapterContent {
  id?: string;
  content_id?: string;
  chapter_id: string;
  content_type: 'text' | 'video' | 'video_link' | 'pdf' | 'image' | 'file' | 'audio' | 'html' | 'link';
  title: string;
  content_text?: string;
  content_url?: string;
  order_index?: number;
  storage_path?: string;
  duration_minutes?: number;
  content_metadata?: Record<string, any>;
}

interface ChapterContentManagerProps {
  chapterId: string;
  chapterName: string;
  contents: ChapterContent[];
  onContentsChange: (contents: ChapterContent[]) => void;
  courseId?: string;
  disabled?: boolean;
  onVideoAdded?: (video: { chapter_id: string; title: string; video_url: string; duration?: number }) => void;
}

type ContentType = 'text' | 'video' | 'video_link' | 'pdf' | 'image' | 'file' | 'link';

export function ChapterContentManager({
  chapterId,
  chapterName,
  contents,
  onContentsChange,
  courseId,
  disabled = false,
  onVideoAdded,
}: ChapterContentManagerProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingContent, setEditingContent] = useState<ChapterContent | null>(null);
  const [contentType, setContentType] = useState<ContentType>('text');
  const [linkType, setLinkType] = useState<'video' | 'material'>('material'); // New state for link type selection
  const [formData, setFormData] = useState({
    title: '',
    content_text: '',
    content_url: '',
    duration_minutes: '',
  });

  const sortedContents = [...contents].sort((a: any, b: any) => (a.order_index || 0) - (b.order_index || 0));

  // Validate and detect link type
  const detectLinkType = (url: string): 'video_link' | 'link' => {
    if (!url) return 'link';
    
    const lowerUrl = url.toLowerCase();
    
    // Check for YouTube links
    if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be') || lowerUrl.includes('youtube.com/embed')) {
      return 'video_link';
    }
    
    // Check for drive links
    if (lowerUrl.includes('drive.google.com') || 
        lowerUrl.includes('onedrive.live.com') || 
        lowerUrl.includes('1drv.ms') ||
        lowerUrl.includes('dropbox.com') ||
        lowerUrl.includes('docs.google.com')) {
      return 'link';
    }
    
    // Default to link for any other URL
    return 'link';
  };

  // Validate drive link format
  const validateDriveLink = (url: string): { valid: boolean; message?: string } => {
    if (!url.trim()) {
      return { valid: false, message: 'URL is required' };
    }

    try {
      new URL(url); // Basic URL validation
    } catch {
      return { valid: false, message: 'Invalid URL format' };
    }

    const lowerUrl = url.toLowerCase();
    
    // Google Drive validation
    if (lowerUrl.includes('drive.google.com')) {
      if (!lowerUrl.includes('/file/d/') && !lowerUrl.includes('/open?id=') && !lowerUrl.includes('/folders/')) {
        return { valid: true, message: 'Note: Make sure the Google Drive file/folder is set to "Anyone with the link can view"' };
      }
    }
    
    // OneDrive validation
    if (lowerUrl.includes('onedrive.live.com') || lowerUrl.includes('1drv.ms')) {
      return { valid: true, message: 'Note: Make sure the OneDrive file is set to "Anyone with the link can view"' };
    }
    
    // Dropbox validation
    if (lowerUrl.includes('dropbox.com')) {
      return { valid: true, message: 'Note: Make sure the Dropbox file is set to "Anyone with the link can view"' };
    }

    return { valid: true };
  };

  const openDialog = (type: ContentType, content?: ChapterContent) => {
    setContentType(type);
    if (content) {
      setEditingContent(content);
      // Detect link type from existing content
      if (type === 'link' || type === 'video_link') {
        setLinkType(content.content_type === 'video_link' ? 'video' : 'material');
      }
      setFormData({
        title: content.title || '',
        content_text: content.content_text || '',
        content_url: content.content_url || '',
        duration_minutes: content.duration_minutes?.toString() || '',
      });
    } else {
      setEditingContent(null);
      // Reset link type to default when adding new link
      if (type === 'link') {
        setLinkType('material');
      }
      setFormData({
        title: '',
        content_text: '',
        content_url: '',
        duration_minutes: '',
      });
    }
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingContent(null);
    setLinkType('material'); // Reset link type
    setFormData({
      title: '',
      content_text: '',
      content_url: '',
      duration_minutes: '',
    });
  };

  const handleSave = () => {
    if (!formData.title.trim()) {
      alert('Title is required');
      return;
    }

    // For link type, use the selected link type (video or material)
    let finalContentType = contentType;
    if ((contentType as string) === 'link') {
      // Use the selected link type instead of auto-detection
      finalContentType = linkType === 'video' ? 'video_link' : 'link';
    } else if ((contentType as string) === 'link' && formData.content_url) {
      // Fallback to auto-detection if linkType not set (for backward compatibility)
      const detectedType = detectLinkType(formData.content_url);
      finalContentType = detectedType;
    }

    // Validate drive links
    if (finalContentType === 'link' && formData.content_url) {
      const validation = validateDriveLink(formData.content_url);
      if (!validation.valid) {
        alert(validation.message || 'Invalid link format');
        return;
      }
    }

    // Validate video links require URL
    if (finalContentType === 'video_link' && !formData.content_url.trim()) {
      alert('Video URL is required');
      return;
    }

    // Generate ID if not editing or if content doesn't have an ID
    const generateId = () => {
      if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
        return window.crypto.randomUUID();
      }
      return `content-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    };

    const newContent: ChapterContent = {
      ...(editingContent || {}),
      id: editingContent?.id || editingContent?.content_id || generateId(),
      content_id: editingContent?.content_id || editingContent?.id || generateId(),
      chapter_id: chapterId,
      content_type: finalContentType,
      title: formData.title.trim(),
      content_text: finalContentType === 'text' ? formData.content_text : undefined,
      content_url: ['video_link', 'link'].includes(finalContentType) ? formData.content_url.trim() : undefined,
      duration_minutes: finalContentType === 'video_link' && formData.duration_minutes ? parseFloat(formData.duration_minutes) : undefined,
      order_index: editingContent?.order_index || (contents.length > 0 ? Math.max(...contents.map((c: any) => c.order_index || 0)) + 1 : 1),
    };

    // If it's a video link, also notify parent to add it to videos table
    if (finalContentType === 'video_link' && onVideoAdded && formData.content_url.trim()) {
      onVideoAdded({
        chapter_id: chapterId,
        title: formData.title.trim(),
        video_url: formData.content_url.trim(),
        duration: formData.duration_minutes ? parseFloat(formData.duration_minutes) : undefined,
      });
    }

    if (editingContent) {
      const editingId = editingContent.id || editingContent.content_id;
      onContentsChange(contents.map((c: any) => {
        const cId = c.id || c.content_id;
        return cId === editingId ? newContent : c;
      }));
    } else {
      onContentsChange([...contents, newContent]);
    }

    closeDialog();
  };

  const handleDelete = (contentId: string | undefined) => {
    if (!contentId) {
      console.warn('Cannot delete: content ID is missing');
      alert('Error: Cannot delete content. Missing content ID.');
      return;
    }
    
    if (confirm('Are you sure you want to delete this content?')) {
      const updatedContents = contents.filter((c: any) => {
        const cId = c.id || c.content_id;
        // Also check by title as fallback if IDs don't match
        if (!cId && contentId) {
          // If content doesn't have ID, skip it (shouldn't happen with new code)
          return true;
        }
        return cId !== contentId;
      });
      
      console.log('Deleting content:', {
        contentId,
        beforeCount: contents.length,
        afterCount: updatedContents.length,
        contents: contents.map((c: any) => ({ id: c.id, content_id: c.content_id, title: c.title }))
      });
      
      if (updatedContents.length === contents.length) {
        console.error('Delete failed: Content not found', { contentId, contents });
        alert('Error: Content not found. It may have already been deleted.');
        return;
      }
      
      onContentsChange(updatedContents);
      console.log('✅ Content deleted successfully:', contentId);
    }
  };

  const handleFileUpload = (fileUrl: string, filePath?: string) => {
    const fileName = fileUrl.split('/').pop() || 'Uploaded file';
    // Determine content type based on file extension
    const fileExtension = fileName.split('.').pop()?.toLowerCase();
    let detectedContentType: ChapterContent['content_type'] = 'file';
    if (fileExtension === 'pdf') {
      detectedContentType = 'pdf';
    } else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExtension || '')) {
      detectedContentType = 'image';
    } else if (['mp4', 'mov', 'avi', 'webm'].includes(fileExtension || '')) {
      detectedContentType = 'video';
    } else if (['mp3', 'wav', 'ogg'].includes(fileExtension || '')) {
      detectedContentType = 'audio';
    }
    
    // Generate ID for uploaded content
    const generateId = () => {
      if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
        return window.crypto.randomUUID();
      }
      return `content-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    };
    
    const newContent: ChapterContent = {
      id: generateId(),
      content_id: generateId(),
      chapter_id: chapterId,
      content_type: contentType === 'pdf' ? 'pdf' : contentType === 'image' ? 'image' : detectedContentType,
      title: fileName,
      content_url: fileUrl,
      storage_path: filePath || undefined, // Save storage_path from upload response
      order_index: contents.length > 0 ? Math.max(...contents.map((c: any) => c.order_index || 0)) + 1 : 1,
    };
    console.log('✅ File uploaded and added to chapter contents:', {
      title: fileName,
      fileUrl,
      storage_path: filePath,
      content_type: newContent.content_type
    });
    onContentsChange([...contents, newContent]);
    closeDialog(); // Close dialog after successful upload
  };

  const getContentIcon = (type: string) => {
    switch (type) {
      case 'video':
      case 'video_link':
        return Video;
      case 'text':
        return FileText;
      case 'pdf':
        return File;
      case 'image':
        return Image;
      case 'link':
        return Link;
      case 'file':
        return File;
      default:
        return File;
    }
  };

  const getContentTypeLabel = (type: string) => {
    switch (type) {
      case 'video':
        return 'Video';
      case 'video_link':
        return 'Video Link';
      case 'text':
        return 'Text';
      case 'pdf':
        return 'PDF';
      case 'image':
        return 'Image';
      case 'link':
        return 'Link';
      case 'file':
        return 'Material';
      default:
        return 'File';
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">{chapterName}</CardTitle>
            <CardDescription>
              {sortedContents.length} content item{sortedContents.length !== 1 ? 's' : ''}
            </CardDescription>
          </div>
          {!disabled && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => openDialog('text')}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Text
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openDialog('link');
                }}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Link
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => openDialog('file')}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Material
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {sortedContents.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">
            No content added yet. Click "Add Text", "Add Link", or "Add Material" to get started.
          </p>
        ) : (
          sortedContents.map((content, index) => {
            const Icon = getContentIcon(content.content_type);
            return (
              <div
                key={content.id || content.content_id || index}
                className="flex items-start gap-3 p-3 border rounded-lg hover:bg-gray-50"
              >
                <GripVertical className="h-5 w-5 text-gray-400 mt-1" />
                <Icon className="h-5 w-5 text-gray-600 mt-1" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium text-sm">{content.title}</h4>
                    <Badge variant="secondary" className="text-xs">
                      {getContentTypeLabel(content.content_type)}
                    </Badge>
                    {content.duration_minutes && (
                      <Badge variant="outline" className="text-xs">
                        {content.duration_minutes} min
                      </Badge>
                    )}
                  </div>
                  {content.content_text && (
                    <p className="text-xs text-gray-600 line-clamp-2">
                      {content.content_text}
                    </p>
                  )}
                  {content.content_url && !content.content_text && (
                    <a
                      href={content.content_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline break-all"
                      title={content.content_url}
                    >
                      {content.content_url.length > 50 
                        ? `${content.content_url.substring(0, 50)}...` 
                        : content.content_url}
                    </a>
                  )}
                </div>
                {!disabled && (
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => openDialog(content.content_type as any, content)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        
                        // Get the content ID - try multiple sources
                        const contentId = content.id || content.content_id;
                        
                        if (contentId) {
                          // Use the ID-based delete
                          handleDelete(contentId);
                        } else {
                          // Fallback: Find by matching properties and delete by index
                          console.warn('Content missing ID, using property matching as fallback:', content);
                          const contentIndex = sortedContents.findIndex(c => 
                            c.title === content.title && 
                            c.content_type === content.content_type &&
                            c.chapter_id === content.chapter_id &&
                            (c.content_text === content.content_text || c.content_url === content.content_url)
                          );
                          
                          if (contentIndex >= 0) {
                            // Remove from sorted contents and update
                            const updatedSorted = sortedContents.filter((_, idx) => idx !== contentIndex);
                            // Convert back to original order and update
                            const updatedContents = contents.filter((c: any) => {
                              const cTitle = c.title;
                              const cType = c.content_type;
                              const cChapterId = c.chapter_id;
                              const cText = c.content_text;
                              const cUrl = c.content_url;
                              
                              return !(cTitle === content.title && 
                                      cType === content.content_type &&
                                      cChapterId === content.chapter_id &&
                                      (cText === content.content_text || cUrl === content.content_url));
                            });
                            
                            onContentsChange(updatedContents);
                            console.log('✅ Content deleted using property matching fallback');
                          } else {
                            console.error('Cannot delete: content not found', { content, contents: contents.map((c: any) => ({ id: c.id, content_id: c.content_id, title: c.title })) });
                            alert('Error: Cannot delete this content. Please refresh the page and try again.');
                          }
                        }
                      }}
                      title="Delete content"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Add Content Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingContent ? 'Edit' : 'Add'} {getContentTypeLabel(contentType)}
              </DialogTitle>
              <DialogDescription>
                {contentType === 'text' && 'Add text content to this chapter'}
                {contentType === 'video_link' && 'Add a link to a video (e.g., YouTube)'}
                {contentType === 'link' && 'Add a link to external content (Google Drive, OneDrive, Dropbox, etc.)'}
                {contentType === 'file' && 'Upload chapter materials (PPT, PDF, DOC, TXT, etc.)'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <Label htmlFor="content-title">Title *</Label>
                <Input
                  id="content-title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Enter content title"
                />
              </div>

              {contentType === 'text' && (
                <div>
                  <Label htmlFor="content-text">Content</Label>
                  <Textarea
                    id="content-text"
                    value={formData.content_text}
                    onChange={(e) => setFormData({ ...formData, content_text: e.target.value })}
                    placeholder="Enter text content"
                    rows={6}
                  />
                </div>
              )}

              {(contentType === 'video_link' || contentType === 'link') && (
                <>
                  {contentType === 'link' && (
                    <div>
                      <Label htmlFor="link-type">Link Type *</Label>
                      <Select value={linkType} onValueChange={(value: 'video' | 'material') => setLinkType(value)}>
                        <SelectTrigger id="link-type">
                          <SelectValue placeholder="Select link type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="video">
                            <div className="flex items-center gap-2">
                              <Video className="h-4 w-4" />
                              Video Link
                            </div>
                          </SelectItem>
                          <SelectItem value="material">
                            <div className="flex items-center gap-2">
                              <Link className="h-4 w-4" />
                              Material Link
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-gray-500 mt-1">
                        {linkType === 'video' 
                          ? 'This link will be saved as a video and counted in the video count'
                          : 'This link will be saved as a material link'}
                      </p>
                    </div>
                  )}
                  <div>
                    <Label htmlFor="content-url">URL *</Label>
                    <Input
                      id="content-url"
                      type="url"
                      value={formData.content_url}
                      onChange={(e) => {
                        const url = e.target.value;
                        setFormData({ ...formData, content_url: url });
                        // Auto-detect link type if it's a link dialog and no type selected yet
                        if (contentType === 'link' && url && linkType === 'material') {
                          const detectedType = detectLinkType(url);
                          if (detectedType === 'video_link') {
                            // Suggest changing to video type
                            console.log('Detected video link, consider selecting "Video Link" type');
                          }
                        }
                      }}
                      placeholder={contentType === 'video_link' || (contentType === 'link' && linkType === 'video')
                        ? "https://www.youtube.com/watch?v=..." 
                        : "https://drive.google.com/file/d/... or any drive link"}
                    />
                    {contentType === 'link' && linkType === 'material' && (
                      <div className="mt-2 space-y-1">
                        <p className="text-xs text-gray-600">
                          Supported: Google Drive, OneDrive, Dropbox, or any shareable link
                        </p>
                        {formData.content_url && (
                          <div className="p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800">
                            <p className="font-medium mb-1">⚠️ Important:</p>
                            <ul className="list-disc list-inside space-y-0.5">
                              <li>Make sure the file/folder is set to "Anyone with the link can view"</li>
                              <li>For Google Drive: Right-click file → Share → Change to "Anyone with the link"</li>
                              <li>For OneDrive: Right-click file → Share → Set permission to "Anyone"</li>
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                    {(contentType === 'video_link' || (contentType === 'link' && linkType === 'video')) && (
                      <p className="text-xs text-gray-500 mt-1">
                        Supports: YouTube, Vimeo, and other video platforms
                      </p>
                    )}
                  </div>
                </>
              )}

              {contentType === 'video_link' && (
                <div>
                  <Label htmlFor="duration">Duration (minutes)</Label>
                  <Input
                    id="duration"
                    type="number"
                    min="0"
                    step="0.1"
                    value={formData.duration_minutes}
                    onChange={(e) => setFormData({ ...formData, duration_minutes: e.target.value })}
                    placeholder="e.g., 15.5"
                  />
                </div>
              )}

              {(contentType === 'pdf' || contentType === 'image' || contentType === 'file') && (
                <div>
                  <Label>Upload File</Label>
                  <FileUploadZone
                    type={contentType === 'image' ? 'thumbnail' : 'material'}
                    courseId={courseId}
                    chapterId={chapterId}
                    onUploadComplete={handleFileUpload}
                    label={`Upload ${getContentTypeLabel(contentType)}`}
                    description={contentType === 'file' 
                      ? "Supported: PPT, PPTX, PDF, DOC, DOCX, TXT, ZIP (Max 50MB)"
                      : undefined}
                  />
                  {contentType === 'file' && (
                    <p className="text-xs text-gray-500 mt-2">
                      💡 Tip: For large files, consider uploading to Google Drive and using the "Add Link" option instead
                    </p>
                  )}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              <Button type="button" onClick={handleSave}>
                {editingContent ? 'Update' : 'Add'} Content
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

