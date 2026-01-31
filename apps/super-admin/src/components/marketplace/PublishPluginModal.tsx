/**
 * Publish Plugin Modal Component
 *
 * Multi-step wizard for super-admins to publish new plugins to the marketplace.
 * Steps:
 * 1. Basic Information (name, description, category, author)
 * 2. Details (long description, tags, links)
 * 3. Media (screenshots, demo URL, icon)
 * 4. Review & Publish
 */

import { useState } from 'react';
import { Button, Input, Badge, Card } from '@plexica/ui';
import { X, ChevronLeft, ChevronRight, Check, Upload, Link as LinkIcon } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';

interface PublishPluginModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

interface PluginFormData {
  id: string;
  name: string;
  version: string;
  description: string;
  longDescription: string;
  category: string;
  author: string;
  authorEmail: string;
  license: string;
  homepage: string;
  repository: string;
  tags: string[];
  screenshots: string[];
  demoUrl: string;
  icon: string;
}

const CATEGORIES = [
  'crm',
  'analytics',
  'billing',
  'marketing',
  'productivity',
  'communication',
  'integration',
  'security',
  'reporting',
  'automation',
  'other',
] as const;

export function PublishPluginModal({ onClose, onSuccess }: PublishPluginModalProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const [formData, setFormData] = useState<PluginFormData>({
    id: '',
    name: '',
    version: '1.0.0',
    description: '',
    longDescription: '',
    category: 'other',
    author: '',
    authorEmail: '',
    license: 'MIT',
    homepage: '',
    repository: '',
    tags: [],
    screenshots: [],
    demoUrl: '',
    icon: '',
  });

  const [tagInput, setTagInput] = useState('');
  const [screenshotInput, setScreenshotInput] = useState('');

  const totalSteps = 4;

  const updateFormData = (field: keyof PluginFormData, value: string | string[]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const addTag = () => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
      updateFormData('tags', [...formData.tags, tagInput.trim()]);
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    updateFormData(
      'tags',
      formData.tags.filter((t) => t !== tag)
    );
  };

  const addScreenshot = () => {
    if (screenshotInput.trim() && !formData.screenshots.includes(screenshotInput.trim())) {
      updateFormData('screenshots', [...formData.screenshots, screenshotInput.trim()]);
      setScreenshotInput('');
    }
  };

  const removeScreenshot = (url: string) => {
    updateFormData(
      'screenshots',
      formData.screenshots.filter((s) => s !== url)
    );
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return (
          formData.id.trim() !== '' &&
          formData.name.trim() !== '' &&
          formData.version.trim() !== '' &&
          formData.description.trim() !== '' &&
          formData.category.trim() !== '' &&
          formData.author.trim() !== '' &&
          formData.authorEmail.trim() !== '' &&
          formData.license.trim() !== ''
        );
      case 2:
        return formData.longDescription.trim() !== '';
      case 3:
        return true; // Media is optional
      case 4:
        return true;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handlePublish = async () => {
    setIsSubmitting(true);

    try {
      const payload = {
        id: formData.id,
        name: formData.name,
        version: formData.version,
        description: formData.description,
        longDescription: formData.longDescription,
        category: formData.category,
        author: formData.author,
        authorEmail: formData.authorEmail,
        license: formData.license,
        homepage: formData.homepage || undefined,
        repository: formData.repository || undefined,
        tags: formData.tags.length > 0 ? formData.tags : undefined,
        screenshots: formData.screenshots.length > 0 ? formData.screenshots : undefined,
        demoUrl: formData.demoUrl || undefined,
        icon: formData.icon || undefined,
        manifest: {
          // Basic manifest structure - customize as needed
          version: formData.version,
          permissions: [],
          endpoints: [],
        },
      };

      await apiClient.publishPlugin(payload);

      toast({
        title: 'Plugin published successfully',
        description: `${formData.name} v${formData.version} is now live on the marketplace`,
        variant: 'success',
      });

      onSuccess();
      onClose();
    } catch (error) {
      console.error('Failed to publish plugin:', error);
      toast({
        title: 'Failed to publish plugin',
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Publish New Plugin</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Step {currentStep} of {totalSteps}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="px-6 pt-4">
          <div className="flex gap-2">
            {Array.from({ length: totalSteps }).map((_, index) => (
              <div
                key={index}
                className={`h-2 flex-1 rounded-full ${
                  index < currentStep ? 'bg-primary' : 'bg-border'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Step 1: Basic Information */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-foreground mb-4">Basic Information</h3>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Plugin ID *
                </label>
                <Input
                  type="text"
                  value={formData.id}
                  onChange={(e) => updateFormData('id', e.target.value)}
                  placeholder="my-awesome-plugin"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Unique identifier (lowercase, hyphens only)
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Plugin Name *
                  </label>
                  <Input
                    type="text"
                    value={formData.name}
                    onChange={(e) => updateFormData('name', e.target.value)}
                    placeholder="My Awesome Plugin"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Version *
                  </label>
                  <Input
                    type="text"
                    value={formData.version}
                    onChange={(e) => updateFormData('version', e.target.value)}
                    placeholder="1.0.0"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Short Description *
                </label>
                <Input
                  type="text"
                  value={formData.description}
                  onChange={(e) => updateFormData('description', e.target.value)}
                  placeholder="A brief description of your plugin (max 150 chars)"
                  maxLength={150}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {formData.description.length}/150 characters
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Category *</label>
                <select
                  value={formData.category}
                  onChange={(e) => updateFormData('category', e.target.value)}
                  className="w-full px-4 py-2 bg-card border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Author Name *
                  </label>
                  <Input
                    type="text"
                    value={formData.author}
                    onChange={(e) => updateFormData('author', e.target.value)}
                    placeholder="John Doe"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Author Email *
                  </label>
                  <Input
                    type="email"
                    value={formData.authorEmail}
                    onChange={(e) => updateFormData('authorEmail', e.target.value)}
                    placeholder="john@example.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">License *</label>
                <select
                  value={formData.license}
                  onChange={(e) => updateFormData('license', e.target.value)}
                  className="w-full px-4 py-2 bg-card border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="MIT">MIT License</option>
                  <option value="Apache-2.0">Apache License 2.0</option>
                  <option value="GPL-3.0">GNU GPL v3</option>
                  <option value="BSD-3-Clause">BSD 3-Clause License</option>
                  <option value="ISC">ISC License</option>
                  <option value="Proprietary">Proprietary</option>
                </select>
              </div>
            </div>
          )}

          {/* Step 2: Details */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-foreground mb-4">Plugin Details</h3>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Long Description *
                </label>
                <textarea
                  value={formData.longDescription}
                  onChange={(e) => updateFormData('longDescription', e.target.value)}
                  placeholder="Provide a detailed description of your plugin, its features, and benefits..."
                  rows={8}
                  className="w-full px-4 py-2 bg-card border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Tags</label>
                <div className="flex gap-2 mb-2">
                  <Input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                    placeholder="Add a tag (press Enter)"
                  />
                  <Button onClick={addTag} variant="outline">
                    Add
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {formData.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="flex items-center gap-1">
                      {tag}
                      <button onClick={() => removeTag(tag)} className="hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Homepage URL
                  </label>
                  <div className="relative">
                    <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="url"
                      value={formData.homepage}
                      onChange={(e) => updateFormData('homepage', e.target.value)}
                      placeholder="https://myplugin.com"
                      className="pl-10"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Repository URL
                  </label>
                  <div className="relative">
                    <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="url"
                      value={formData.repository}
                      onChange={(e) => updateFormData('repository', e.target.value)}
                      placeholder="https://github.com/user/plugin"
                      className="pl-10"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Media */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-foreground mb-4">Media & Assets</h3>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Icon Emoji</label>
                <Input
                  type="text"
                  value={formData.icon}
                  onChange={(e) => updateFormData('icon', e.target.value)}
                  placeholder="🧩"
                  maxLength={2}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Use an emoji to represent your plugin
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Demo URL</label>
                <div className="relative">
                  <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="url"
                    value={formData.demoUrl}
                    onChange={(e) => updateFormData('demoUrl', e.target.value)}
                    placeholder="https://demo.myplugin.com"
                    className="pl-10"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Screenshots
                </label>
                <div className="flex gap-2 mb-2">
                  <Input
                    type="url"
                    value={screenshotInput}
                    onChange={(e) => setScreenshotInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addScreenshot())}
                    placeholder="Add screenshot URL (press Enter)"
                  />
                  <Button onClick={addScreenshot} variant="outline">
                    <Upload className="h-4 w-4 mr-2" />
                    Add
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {formData.screenshots.map((url, index) => (
                    <div key={index} className="relative group">
                      <img
                        src={url}
                        alt={`Screenshot ${index + 1}`}
                        className="w-full h-32 object-cover rounded-lg border border-border"
                      />
                      <button
                        onClick={() => removeScreenshot(url)}
                        className="absolute top-2 right-2 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
                {formData.screenshots.length === 0 && (
                  <p className="text-sm text-muted-foreground mt-2">No screenshots added yet</p>
                )}
              </div>
            </div>
          )}

          {/* Step 4: Review */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">Review & Publish</h3>

              <div className="space-y-4">
                <div className="bg-muted/50 rounded-lg p-4">
                  <h4 className="font-semibold text-foreground mb-2">Basic Information</h4>
                  <dl className="grid grid-cols-2 gap-2 text-sm">
                    <dt className="text-muted-foreground">Name:</dt>
                    <dd className="text-foreground font-medium">{formData.name}</dd>
                    <dt className="text-muted-foreground">Version:</dt>
                    <dd className="text-foreground">{formData.version}</dd>
                    <dt className="text-muted-foreground">Category:</dt>
                    <dd className="text-foreground capitalize">{formData.category}</dd>
                    <dt className="text-muted-foreground">Author:</dt>
                    <dd className="text-foreground">{formData.author}</dd>
                  </dl>
                </div>

                <div className="bg-muted/50 rounded-lg p-4">
                  <h4 className="font-semibold text-foreground mb-2">Description</h4>
                  <p className="text-sm text-foreground mb-2">{formData.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {formData.longDescription.substring(0, 200)}
                    {formData.longDescription.length > 200 && '...'}
                  </p>
                </div>

                {formData.tags.length > 0 && (
                  <div className="bg-muted/50 rounded-lg p-4">
                    <h4 className="font-semibold text-foreground mb-2">Tags</h4>
                    <div className="flex flex-wrap gap-2">
                      {formData.tags.map((tag) => (
                        <Badge key={tag} variant="secondary">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {formData.screenshots.length > 0 && (
                  <div className="bg-muted/50 rounded-lg p-4">
                    <h4 className="font-semibold text-foreground mb-2">
                      Screenshots ({formData.screenshots.length})
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      {formData.screenshots.length} screenshot(s) ready for publication
                    </p>
                  </div>
                )}
              </div>

              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 text-sm">
                <p className="text-blue-600 dark:text-blue-400">
                  <strong>Note:</strong> The plugin will be published immediately to the marketplace
                  with PUBLISHED status. Make sure all information is correct before proceeding.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border flex items-center justify-between">
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>

          <div className="flex gap-2">
            {currentStep > 1 && (
              <Button variant="outline" onClick={handleBack} disabled={isSubmitting}>
                <ChevronLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            )}

            {currentStep < totalSteps ? (
              <Button onClick={handleNext} disabled={!canProceed()}>
                Next
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <Button onClick={handlePublish} disabled={isSubmitting || !canProceed()}>
                {isSubmitting ? (
                  <>
                    <div className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-current border-r-transparent mr-2"></div>
                    Publishing...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Publish Plugin
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
