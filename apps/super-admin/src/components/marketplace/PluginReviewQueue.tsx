/**
 * Plugin Review Queue Component
 *
 * Super-admin component for reviewing and approving/rejecting plugins
 * submitted by developers for marketplace publication.
 */

import { useState, useEffect, useCallback } from 'react';
import { Button, Badge, Card } from '@plexica/ui';
import { Check, X, Eye, Clock, AlertCircle } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { Plugin } from '@/types';
import { useToast } from '@/hooks/use-toast';

interface ReviewDialogProps {
  plugin: Plugin | null;
  onClose: () => void;
  onReview: () => void;
}

function ReviewDialog({ plugin, onClose, onReview }: ReviewDialogProps) {
  const [action, setAction] = useState<'approve' | 'reject' | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  if (!plugin) return null;

  const handleSubmit = async () => {
    if (!action) return;
    if (action === 'reject' && !rejectionReason.trim()) {
      toast({
        title: 'Error',
        description: 'Please provide a reason for rejection',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await apiClient.reviewPlugin(plugin.id, {
        action,
        reason: action === 'reject' ? rejectionReason : undefined,
      });

      toast({
        title: 'Success',
        description: `Plugin ${action === 'approve' ? 'approved' : 'rejected'} successfully`,
      });

      onReview();
      onClose();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || `Failed to ${action} plugin`,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-card border-b border-border p-6">
          <h2 className="text-2xl font-bold text-foreground">Review Plugin</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {plugin.name} v{plugin.version}
          </p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Plugin Info */}
          <div>
            <h3 className="font-semibold text-foreground mb-3">Plugin Information</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Name:</span>
                <span className="text-foreground font-medium">{plugin.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Version:</span>
                <span className="text-foreground">{plugin.version}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Author:</span>
                <span className="text-foreground">{plugin.author}</span>
              </div>
              {plugin.authorEmail && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email:</span>
                  <span className="text-foreground">{plugin.authorEmail}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Category:</span>
                <span className="text-foreground capitalize">{plugin.category}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Submitted:</span>
                <span className="text-foreground">
                  {plugin.submittedAt ? new Date(plugin.submittedAt).toLocaleDateString() : 'N/A'}
                </span>
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <h3 className="font-semibold text-foreground mb-2">Description</h3>
            <p className="text-sm text-muted-foreground">{plugin.description}</p>
          </div>

          {/* Long Description */}
          {plugin.longDescription && (
            <div>
              <h3 className="font-semibold text-foreground mb-2">Detailed Description</h3>
              <div className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted/30 p-4 rounded-lg">
                {plugin.longDescription}
              </div>
            </div>
          )}

          {/* Links */}
          {(plugin.homepage || plugin.repository) && (
            <div>
              <h3 className="font-semibold text-foreground mb-2">Links</h3>
              <div className="space-y-1">
                {plugin.homepage && (
                  <a
                    href={plugin.homepage}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline block"
                  >
                    Homepage →
                  </a>
                )}
                {plugin.repository && (
                  <a
                    href={plugin.repository}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline block"
                  >
                    Repository →
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Tags */}
          {plugin.tags && plugin.tags.length > 0 && (
            <div>
              <h3 className="font-semibold text-foreground mb-2">Tags</h3>
              <div className="flex flex-wrap gap-2">
                {plugin.tags.map((tag) => (
                  <Badge key={tag} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Review Actions */}
          <div className="border-t border-border pt-6">
            <h3 className="font-semibold text-foreground mb-3">Review Action</h3>

            {!action ? (
              <div className="grid grid-cols-2 gap-4">
                <Button
                  onClick={() => setAction('approve')}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <Check className="mr-2 h-4 w-4" />
                  Approve
                </Button>
                <Button onClick={() => setAction('reject')} variant="destructive">
                  <X className="mr-2 h-4 w-4" />
                  Reject
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {action === 'approve' ? (
                  <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-lg p-4">
                    <div className="flex items-start">
                      <Check className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5 mr-3" />
                      <div>
                        <p className="text-sm font-medium text-green-900 dark:text-green-100">
                          Ready to approve
                        </p>
                        <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                          This plugin will be published to the marketplace and available for all
                          tenants to install.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-lg p-4">
                      <div className="flex items-start">
                        <X className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 mr-3" />
                        <div>
                          <p className="text-sm font-medium text-red-900 dark:text-red-100">
                            Rejecting plugin
                          </p>
                          <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                            The author will be notified with your feedback.
                          </p>
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        Reason for rejection *
                      </label>
                      <textarea
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        placeholder="Explain why this plugin is being rejected..."
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                        rows={4}
                      />
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  <Button onClick={() => setAction(null)} variant="outline" disabled={isSubmitting}>
                    Back
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className={
                      action === 'approve'
                        ? 'bg-green-600 hover:bg-green-700 text-white flex-1'
                        : 'flex-1'
                    }
                    variant={action === 'approve' ? 'default' : 'destructive'}
                  >
                    {isSubmitting
                      ? 'Submitting...'
                      : `Confirm ${action === 'approve' ? 'Approval' : 'Rejection'}`}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-card border-t border-border p-4 flex justify-end">
          {!action && (
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function PluginReviewQueue() {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPlugin, setSelectedPlugin] = useState<Plugin | null>(null);
  const { toast } = useToast();

  const fetchPendingPlugins = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await apiClient.searchMarketplace({
        status: 'PENDING_REVIEW',
        sortBy: 'submittedAt',
        sortOrder: 'asc',
        limit: 100,
      });
      setPlugins(response.data || []);
    } catch (error: any) {
      console.error('Failed to fetch pending plugins:', error);
      toast({
        title: 'Error',
        description: 'Failed to load pending plugins',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchPendingPlugins();
  }, [fetchPendingPlugins]);

  const handleReviewComplete = () => {
    fetchPendingPlugins();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent mb-4"></div>
          <p className="text-muted-foreground">Loading review queue...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Clock className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-bold text-foreground">Plugin Review Queue</h2>
        </div>
        <p className="text-muted-foreground">Review and approve plugins submitted by developers</p>
      </div>

      {/* Stats */}
      {plugins.length > 0 && (
        <div className="mb-6">
          <Card className="p-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              <span className="text-foreground">
                <strong>{plugins.length}</strong> plugin{plugins.length !== 1 ? 's' : ''} pending
                review
              </span>
            </div>
          </Card>
        </div>
      )}

      {/* Queue List */}
      {plugins.length === 0 ? (
        <Card className="p-12">
          <div className="text-center">
            <Check className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">All Caught Up!</h3>
            <p className="text-muted-foreground">No plugins pending review at the moment.</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {plugins.map((plugin) => (
            <Card key={plugin.id} className="p-6 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-foreground">{plugin.name}</h3>
                    <Badge variant="secondary">{plugin.version}</Badge>
                    <Badge variant="outline" className="capitalize">
                      {plugin.category}
                    </Badge>
                  </div>

                  <p className="text-sm text-muted-foreground mb-3">{plugin.description}</p>

                  <div className="flex items-center gap-6 text-sm text-muted-foreground">
                    <span>
                      <strong className="text-foreground">Author:</strong> {plugin.author}
                    </span>
                    {plugin.submittedAt && (
                      <span>
                        <strong className="text-foreground">Submitted:</strong>{' '}
                        {new Date(plugin.submittedAt).toLocaleDateString()}
                      </span>
                    )}
                    {plugin.tags && plugin.tags.length > 0 && (
                      <span>
                        <strong className="text-foreground">Tags:</strong> {plugin.tags.join(', ')}
                      </span>
                    )}
                  </div>
                </div>

                <Button onClick={() => setSelectedPlugin(plugin)} size="sm" className="ml-4">
                  <Eye className="mr-2 h-4 w-4" />
                  Review
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Review Dialog */}
      {selectedPlugin && (
        <ReviewDialog
          plugin={selectedPlugin}
          onClose={() => setSelectedPlugin(null)}
          onReview={handleReviewComplete}
        />
      )}
    </div>
  );
}
