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
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
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

// Form validation schema
const settingsFormSchema = z.object({
  // Content Management
  maxTagsPerPost: z.number().min(1).max(100),
  enableCaptcha: z.boolean(),
  requireApproval: z.boolean(),
  postsPageSize: z.number().min(6).max(100),
  featuredPostsLimit: z.number().min(1).max(50),
  allowUserPosts: z.boolean(),

  // Security & Rate Limiting
  maxPostsPerDay: z.number().min(1).max(1000),
  enableAuditLogging: z.boolean(),
});

type FormData = z.infer<typeof settingsFormSchema>;

export function SettingsForm() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);

  const form = useForm<FormData>({
    resolver: zodResolver(settingsFormSchema),
    defaultValues: {
      maxTagsPerPost: 20,
      enableCaptcha: false,
      requireApproval: true,
      allowUserPosts: true,
      maxPostsPerDay: 10,
      enableAuditLogging: true,
      postsPageSize: 12,
      featuredPostsLimit: 12,
    },
  });

  // Load current settings
  useEffect(() => {
    async function loadSettings() {
      try {
        const result = await getSettingsAction();
        if (result.success && result.data) {
          const settings = result.data;
          form.reset({
            maxTagsPerPost: settings.maxTagsPerPost ?? undefined,
            enableCaptcha: settings.enableCaptcha ?? undefined,
            requireApproval: settings.requireApproval ?? undefined,
            maxPostsPerDay: settings.maxPostsPerDay ?? undefined,
            enableAuditLogging: settings.enableAuditLogging ?? undefined,
            postsPageSize: settings.postsPageSize ?? undefined,
            featuredPostsLimit: settings.featuredPostsLimit ?? undefined,
            allowUserPosts: settings.allowUserPosts ?? true,
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
        <Tabs defaultValue="content" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="content" className="flex items-center gap-2">
              <Settings2 className="h-4 w-4" />
              Content
            </TabsTrigger>
            <TabsTrigger value="security" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Security
            </TabsTrigger>
          </TabsList>

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
