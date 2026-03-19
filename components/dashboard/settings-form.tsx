"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Database,
  Upload,
  Shield,
  Settings2,
  Save,
  RotateCcw,
} from "@/components/ui/icons";
import {
  getSettingsAction,
  updateSettingsAction,
  resetSettingsToDefaultAction,
} from "@/actions/settings";
import { clearMediaUrlCache } from "@/components/media-display";

// Form validation schema
const settingsFormSchema = z.object({
  // Storage Configuration
  storageType: z.enum(["S3", "LOCAL", "DOSPACE"]),
  s3BucketName: z.string().optional(),
  s3Region: z.string().optional(),
  s3AccessKeyId: z.string().optional(),
  s3SecretKey: z.string().optional(),
  s3CloudfrontUrl: z.string().url().optional().or(z.literal("")),
  doSpaceName: z.string().optional(),
  doRegion: z.string().optional(),
  doAccessKeyId: z.string().optional(),
  doSecretKey: z.string().optional(),
  doCdnUrl: z.string().url().optional().or(z.literal("")),
  localBasePath: z.string().optional(),
  localBaseUrl: z.string().optional(),

  // Upload Limits
  maxImageSize: z
    .number()
    .min(1024)
    .max(50 * 1024 * 1024), // 1KB to 50MB
  maxVideoSize: z
    .number()
    .min(1024)
    .max(500 * 1024 * 1024), // 1KB to 500MB
  enableCompression: z.boolean(),
  compressionQuality: z.number().min(1).max(100),

  // Content Management
  maxTagsPerPost: z.number().min(1).max(100),
  enableCaptcha: z.boolean(),
  requireApproval: z.boolean(),
  postsPageSize: z.number().min(6).max(100),
  featuredPostsLimit: z.number().min(1).max(50),
  allowUserPosts: z.boolean(),
  allowUserUploads: z.boolean(),

  // Security & Rate Limiting
  maxPostsPerDay: z.number().min(1).max(1000),
  maxUploadsPerHour: z.number().min(1).max(1000),
  enableAuditLogging: z.boolean(),
});

type FormData = z.infer<typeof settingsFormSchema>;

export function SettingsForm() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [hasS3Credentials, setHasS3Credentials] = useState(false);
  const [hasDoCredentials, setHasDoCredentials] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(settingsFormSchema),
    defaultValues: {
      storageType: "S3",
      s3BucketName: "",
      s3Region: "us-east-1",
      s3AccessKeyId: "",
      s3SecretKey: "",
      s3CloudfrontUrl: "",
      doSpaceName: "",
      doRegion: "",
      doAccessKeyId: "",
      doSecretKey: "",
      doCdnUrl: "",
      localBasePath: "/uploads",
      localBaseUrl: "/uploads",
      maxImageSize: 2097152, // 2MB
      maxVideoSize: 10485760, // 10MB
      enableCompression: true,
      compressionQuality: 80,
      maxTagsPerPost: 20,
      enableCaptcha: false,
      requireApproval: true,
      allowUserPosts: true,
      allowUserUploads: true,
      maxPostsPerDay: 10,
      maxUploadsPerHour: 20,
      enableAuditLogging: true,
      postsPageSize: 12,
      featuredPostsLimit: 12,
    },
  });

  const watchStorageType = form.watch("storageType");

  // Load current settings
  useEffect(() => {
    async function loadSettings() {
      try {
        const result = await getSettingsAction();
        if (result.success && result.data) {
          const settings = result.data;
          // Track vault presence so credential inputs can show "saved" state
          setHasS3Credentials(
            (settings as { hasS3Credentials?: boolean }).hasS3Credentials ?? false
          );
          setHasDoCredentials(
            (settings as { hasDoCredentials?: boolean }).hasDoCredentials ?? false
          );
          form.reset({
            storageType: settings.storageType ?? undefined,
            s3BucketName: settings.s3BucketName || "",
            s3Region: settings.s3Region || "us-east-1",
            // Credentials are in Vault — leave fields empty so admins can
            // type a new value to replace, or leave blank to keep existing.
            s3AccessKeyId: "",
            s3SecretKey: "",
            s3CloudfrontUrl: settings.s3CloudfrontUrl || "",
            doSpaceName: settings.doSpaceName || "",
            doRegion: settings.doRegion || "",
            doAccessKeyId: "",
            doSecretKey: "",
            doCdnUrl: settings.doCdnUrl || "",
            localBasePath: settings.localBasePath || "/uploads",
            localBaseUrl: settings.localBaseUrl || "/uploads",
            maxImageSize: settings.maxImageSize ?? undefined,
            maxVideoSize: settings.maxVideoSize ?? undefined,
            enableCompression: settings.enableCompression ?? undefined,
            compressionQuality: settings.compressionQuality ?? undefined,
            maxTagsPerPost: settings.maxTagsPerPost ?? undefined,
            enableCaptcha: settings.enableCaptcha ?? undefined,
            requireApproval: settings.requireApproval ?? undefined,
            maxPostsPerDay: settings.maxPostsPerDay ?? undefined,
            maxUploadsPerHour: settings.maxUploadsPerHour ?? undefined,
            enableAuditLogging: settings.enableAuditLogging ?? undefined,
            postsPageSize: settings.postsPageSize ?? undefined,
            featuredPostsLimit: settings.featuredPostsLimit ?? undefined,
            allowUserPosts: settings.allowUserPosts ?? true,
            allowUserUploads: settings.allowUserUploads ?? true,
          });
        }
      } catch (error) {
        console.error("Failed to load settings:", error);
        toast.error("Failed to load settings");
      } finally {
        setIsLoadingData(false);
      }
    }

    loadSettings();
  }, [form]);

  // Handle form submission
  const onSubmit = async (data: FormData) => {
    setIsLoading(true);
    try {
      const result = await updateSettingsAction(data);
      if (result.success) {
        // Clear media URL cache to ensure new storage URLs are used
        clearMediaUrlCache();
        toast.success("Settings updated successfully");
        router.refresh();
      } else {
        toast.error(result.error || "Failed to update settings");
      }
    } catch (error) {
      console.error("Error updating settings:", error);
      toast.error("Failed to update settings");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle reset to defaults
  const handleReset = async () => {
    setIsLoading(true);
    try {
      const result = await resetSettingsToDefaultAction();
      if (result.success) {
        // Clear media URL cache to ensure new storage URLs are used
        clearMediaUrlCache();
        toast.success("Settings reset to defaults");
        // Reload the form with default values
        window.location.reload();
      } else {
        toast.error(result.error || "Failed to reset settings");
      }
    } catch (error) {
      console.error("Error resetting settings:", error);
      toast.error("Failed to reset settings");
    } finally {
      setIsLoading(false);
    }
  };

  // Helper function to format bytes
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  if (isLoadingData) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="h-6 w-48 bg-muted animate-pulse rounded" />
            <div className="h-4 w-72 bg-muted animate-pulse rounded" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="h-10 bg-muted animate-pulse rounded" />
              <div className="h-10 bg-muted animate-pulse rounded" />
              <div className="h-10 bg-muted animate-pulse rounded" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Tabs defaultValue="storage" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="storage" className="flex items-center gap-2">
              <Database className="h-4 w-4" />
              Storage
            </TabsTrigger>
            <TabsTrigger value="uploads" className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Uploads
            </TabsTrigger>
            <TabsTrigger value="content" className="flex items-center gap-2">
              <Settings2 className="h-4 w-4" />
              Content
            </TabsTrigger>
            <TabsTrigger value="security" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Security
            </TabsTrigger>
          </TabsList>

          {/* Storage Configuration */}
          <TabsContent value="storage" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Storage Configuration
                </CardTitle>
                <CardDescription>
                  Choose between S3 cloud storage or local file storage for
                  uploads.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <FormField
                  control={form.control}
                  name="storageType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Storage Type</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select storage type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="S3">
                            Amazon S3 Cloud Storage
                            <Badge variant="secondary" className="ml-2">
                              Recommended
                            </Badge>
                          </SelectItem>
                          <SelectItem value="DOSPACE">
                            DigitalOcean Spaces
                            <Badge variant="secondary" className="ml-2">
                              S3-Compatible
                            </Badge>
                          </SelectItem>
                          <SelectItem value="LOCAL">
                            Local File Storage
                            <Badge variant="outline" className="ml-2">
                              Basic
                            </Badge>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        S3 and DigitalOcean Spaces provide scalable cloud
                        storage with CDN support. Local storage keeps files on
                        your server.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {watchStorageType === "S3" && (
                  <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                    <h4 className="font-medium text-sm">S3 Configuration</h4>
                    <div className="grid gap-4 md:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="s3BucketName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Bucket Name</FormLabel>
                            <FormControl>
                              <Input placeholder="my-app-uploads" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="s3Region"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Region</FormLabel>
                            <FormControl>
                              <Input placeholder="us-east-1" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="s3AccessKeyId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Access Key ID</FormLabel>
                            <FormControl>
                              <Input
                                placeholder={
                                  hasS3Credentials
                                    ? "Saved in Vault — enter new value to replace"
                                    : "AKIAIOSFODNN7EXAMPLE"
                                }
                                {...field}
                              />
                            </FormControl>
                            {hasS3Credentials && !field.value && (
                              <p className="text-xs text-muted-foreground">
                                Access key is saved in Supabase Vault. Leave blank to keep existing.
                              </p>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="s3SecretKey"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Secret Access Key</FormLabel>
                            <FormControl>
                              <Input
                                type="password"
                                placeholder={
                                  hasS3Credentials
                                    ? "Saved in Vault — enter new value to replace"
                                    : "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                                }
                                {...field}
                              />
                            </FormControl>
                            {hasS3Credentials && !field.value && (
                              <p className="text-xs text-muted-foreground">
                                Secret key is saved in Supabase Vault. Leave blank to keep existing.
                              </p>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="s3CloudfrontUrl"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>CloudFront URL (Optional)</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="https://d1234567890.cloudfront.net"
                              {...field}
                            />
                          </FormControl>
                          <FormDescription>
                            Use CloudFront CDN for faster file delivery
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                {watchStorageType === "DOSPACE" && (
                  <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                    <h4 className="font-medium text-sm">
                      DigitalOcean Spaces Configuration
                    </h4>
                    <div className="grid gap-4 md:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="doSpaceName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Space Name</FormLabel>
                            <FormControl>
                              <Input placeholder="my-app-uploads" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="doRegion"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Region</FormLabel>
                            <FormControl>
                              <Input placeholder="nyc3" {...field} />
                            </FormControl>
                            <FormDescription>
                              e.g., nyc3, sfo3, ams3, sgp1, fra1
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="doAccessKeyId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Access Key ID</FormLabel>
                            <FormControl>
                              <Input
                                placeholder={
                                  hasDoCredentials
                                    ? "Saved in Vault — enter new value to replace"
                                    : "DO00ABC123DEF456GHI7"
                                }
                                {...field}
                              />
                            </FormControl>
                            {hasDoCredentials && !field.value && (
                              <p className="text-xs text-muted-foreground">
                                Access key is saved in Supabase Vault. Leave blank to keep existing.
                              </p>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="doSecretKey"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Secret Access Key</FormLabel>
                            <FormControl>
                              <Input
                                type="password"
                                placeholder={
                                  hasDoCredentials
                                    ? "Saved in Vault — enter new value to replace"
                                    : "abcdefghijklmnopqrstuvwxyz123456789"
                                }
                                {...field}
                              />
                            </FormControl>
                            {hasDoCredentials && !field.value && (
                              <p className="text-xs text-muted-foreground">
                                Secret key is saved in Supabase Vault. Leave blank to keep existing.
                              </p>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="doCdnUrl"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>CDN URL (Optional)</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="https://my-space.nyc3.cdn.digitaloceanspaces.com"
                              {...field}
                            />
                          </FormControl>
                          <FormDescription>
                            Use DigitalOcean CDN for faster file delivery
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                {watchStorageType === "LOCAL" && (
                  <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                    <h4 className="font-medium text-sm">
                      Local Storage Configuration
                    </h4>
                    <div className="grid gap-4 md:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="localBasePath"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Base Path</FormLabel>
                            <FormControl>
                              <Input placeholder="/uploads" {...field} />
                            </FormControl>
                            <FormDescription>
                              Directory path on server (relative to public
                              folder)
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="localBaseUrl"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Base URL</FormLabel>
                            <FormControl>
                              <Input placeholder="/uploads" {...field} />
                            </FormControl>
                            <FormDescription>
                              Public URL path for serving files
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Upload Configuration */}
          <TabsContent value="uploads" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  Upload Limits & Processing
                </CardTitle>
                <CardDescription>
                  Configure file size limits and image processing options.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-6 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="maxImageSize"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Max Image Size: {formatBytes(field.value)}
                        </FormLabel>
                        <FormControl>
                          <Slider
                            value={[field.value]}
                            onValueChange={(value) => field.onChange(value[0])}
                            max={50 * 1024 * 1024} // 50MB
                            min={1024} // 1KB
                            step={1024 * 256} // 256KB steps
                            className="w-full"
                          />
                        </FormControl>
                        <FormDescription>
                          Maximum allowed image file size
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="maxVideoSize"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Max Video Size: {formatBytes(field.value)}
                        </FormLabel>
                        <FormControl>
                          <Slider
                            value={[field.value]}
                            onValueChange={(value) => field.onChange(value[0])}
                            max={500 * 1024 * 1024} // 500MB
                            min={1024} // 1KB
                            step={1024 * 1024} // 1MB steps
                            className="w-full"
                          />
                        </FormControl>
                        <FormDescription>
                          Maximum allowed video file size
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <Separator />

                <div className="space-y-4">
                  <h4 className="font-medium">Image Processing</h4>
                  <div className="grid gap-6 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="enableCompression"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">
                              Enable Compression
                            </FormLabel>
                            <FormDescription>
                              Automatically compress images to WebP format
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="compressionQuality"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Compression Quality: {field.value}%
                          </FormLabel>
                          <FormControl>
                            <Slider
                              value={[field.value]}
                              onValueChange={(value) =>
                                field.onChange(value[0])
                              }
                              max={100}
                              min={1}
                              step={1}
                              className="w-full"
                            />
                          </FormControl>
                          <FormDescription>
                            Higher quality = larger file sizes
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Content Management */}
          <TabsContent value="content" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings2 className="h-5 w-5" />
                  Content Management
                </CardTitle>
                <CardDescription>
                  Configure content policies and user submission settings.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-6 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="maxTagsPerPost"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Max Tags Per Post: {field.value}</FormLabel>
                        <FormControl>
                          <Slider
                            value={[field.value]}
                            onValueChange={(value) => field.onChange(value[0])}
                            max={100}
                            min={1}
                            step={1}
                            className="w-full"
                          />
                        </FormControl>
                        <FormDescription>
                          Maximum tags allowed per post
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="postsPageSize"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Posts per page: {field.value}</FormLabel>
                        <FormControl>
                          <Slider
                            value={[field.value]}
                            onValueChange={(value) => field.onChange(value[0])}
                            max={100}
                            min={6}
                            step={1}
                            className="w-full"
                          />
                        </FormControl>
                        <FormDescription>
                          Number of posts to show per page in the directory
                          (6-100)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="featuredPostsLimit"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Featured Posts Limit: {field.value}</FormLabel>
                        <FormControl>
                          <Slider
                            value={[field.value]}
                            onValueChange={(value) => field.onChange(value[0])}
                            max={50}
                            min={1}
                            step={1}
                            className="w-full"
                          />
                        </FormControl>
                        <FormDescription>
                          Number of featured posts to show on homepage (1-50)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="requireApproval"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">
                            Require Approval
                          </FormLabel>
                          <FormDescription>
                            New posts need admin approval before publishing
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="enableCaptcha"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">
                            Enable CAPTCHA
                          </FormLabel>
                          <FormDescription>
                            Require CAPTCHA verification for submissions
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                <Separator />

                <div className="space-y-2">
                  <h4 className="text-sm font-medium">User Submission Controls</h4>
                  <p className="text-sm text-muted-foreground">
                    Control what regular users are allowed to contribute.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="allowUserPosts"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">
                            Allow User Submissions
                          </FormLabel>
                          <FormDescription>
                            Let registered users submit posts for approval. Disable to close submissions.
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="allowUserUploads"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">
                            Allow User Media Uploads
                          </FormLabel>
                          <FormDescription>
                            Let users attach images or videos to their submissions.
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security & Rate Limiting */}
          <TabsContent value="security" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Security & Rate Limiting
                </CardTitle>
                <CardDescription>
                  Configure security settings and rate limits to prevent abuse.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-6 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="maxPostsPerDay"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Max Posts Per Day: {field.value}</FormLabel>
                        <FormControl>
                          <Slider
                            value={[field.value]}
                            onValueChange={(value) => field.onChange(value[0])}
                            max={1000}
                            min={1}
                            step={1}
                            className="w-full"
                          />
                        </FormControl>
                        <FormDescription>
                          Maximum posts a user can create per day
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="maxUploadsPerHour"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Max Uploads Per Hour: {field.value}
                        </FormLabel>
                        <FormControl>
                          <Slider
                            value={[field.value]}
                            onValueChange={(value) => field.onChange(value[0])}
                            max={1000}
                            min={1}
                            step={1}
                            className="w-full"
                          />
                        </FormControl>
                        <FormDescription>
                          Maximum file uploads per hour per user
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="enableAuditLogging"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">
                          Enable Audit Logging
                        </FormLabel>
                        <FormDescription>
                          Log all administrative actions and security events
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-6 border-t">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" disabled={isLoading}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Reset to Defaults
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset Settings to Defaults?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action will reset all settings to their default values.
                  This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleReset}>
                  Reset Settings
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Button type="submit" disabled={isLoading}>
            {isLoading ? (
              <>
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-background border-t-current" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Settings
              </>
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
