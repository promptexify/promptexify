"use client";

import React, { useState, useMemo, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, X, Plus } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

interface Tag {
  id: string;
  name: string;
  slug: string;
}

interface TagSelectorProps {
  availableTags: Tag[];
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  onPendingTagsChange?: (pendingTags: string[]) => void;
  pendingTags?: string[];
  maxTags?: number;
  disabled?: boolean;
  className?: string;
}

// Define the banned tag name patterns
const BANNED_TAG_NAME_PATTERNS = [
  // Offensive/bad words
  /\b(fuck|suck|shit|bitch|asshole|cunt|dick|bastard|slut|whore|motherfucker|pussy|nigger|faggot|retard|wanker|chink|gook|kyke|spic|pedophile|porn|hentai)\b/i,
  /^(.)\1{4,}$/, // 5+ repeated characters (e.g., "aaaaa")
  /^\s+$|^$|^\s*$/, // Only spaces or empty, or only whitespace
  /\s{4,}/, // 4+ consecutive spaces
  /(\d)\1{4,}/, // 5+ repeated digits (e.g., "11111")
  /([^a-zA-Z\d\s\-_])\1{4,}/, // 5+ repeated non-alphanumeric, non-whitespace chars (excluding _ and - for tags)
  /\b[A-Z]{5,}\d{3,}\b/, // e.g., USER12345 (blocks capital letters followed by numbers)
  /\b\d{6,}\b/, // e.g., 123456789 (blocks long sequences of only numbers)
];

export function TagSelector({
  availableTags,
  selectedTags,
  onTagsChange,
  onPendingTagsChange,
  pendingTags = [],
  maxTags = 15,
  disabled = false,
  className,
}: TagSelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [tagValidationError, setTagValidationError] = useState<string | null>(
    null
  );

  // Filter available tags based on search query
  const filteredAvailableTags = useMemo(() => {
    if (!searchQuery) return availableTags;

    return availableTags.filter((tag) =>
      tag.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [availableTags, searchQuery]);

  // Display tags (show only first 20 unless "show all" is clicked)
  const displayTags = useMemo(() => {
    return showAll ? filteredAvailableTags : filteredAvailableTags.slice(0, 20);
  }, [filteredAvailableTags, showAll]);

  // Get selected tag objects (existing tags only)
  const selectedExistingTagObjects = useMemo(() => {
    return availableTags.filter((tag) => selectedTags.includes(tag.name));
  }, [availableTags, selectedTags]);

  // Get pending tags that are selected but don't exist yet
  const selectedPendingTags = useMemo(() => {
    return selectedTags.filter(
      (tagName) => !availableTags.some((tag) => tag.name === tagName)
    );
  }, [selectedTags, availableTags]);

  // Check if search query matches existing tag
  const exactMatch = useMemo(() => {
    return availableTags.find(
      (tag) => tag.name.toLowerCase() === searchQuery.toLowerCase()
    );
  }, [availableTags, searchQuery]);

  // Check if search query matches pending tag
  const pendingMatch = useMemo(() => {
    return pendingTags.find(
      (tagName) => tagName.toLowerCase() === searchQuery.toLowerCase()
    );
  }, [pendingTags, searchQuery]);

  // Validate tag name format (only a-z, A-Z, 0-9, spaces, hyphens, underscores)
  const isValidTagName = useCallback((name: string): boolean => {
    const trimmedName = name.trim();

    // Check basic format and length first
    if (!/^[a-zA-Z0-9\s\-_,]+$/.test(trimmedName)) {
      setTagValidationError(
        "Tag name can only contain letters, numbers, spaces, hyphens, underscores, and commas."
      );
      return false;
    }
    if (trimmedName.length === 0) {
      setTagValidationError("Tag name cannot be empty.");
      return false;
    }
    if (trimmedName.length > 50) {
      setTagValidationError("Tag name cannot exceed 50 characters.");
      return false;
    }

    // Check against banned patterns
    for (const pattern of BANNED_TAG_NAME_PATTERNS) {
      if (pattern.test(trimmedName)) {
        setTagValidationError("Not allowed. Please choose a different one.");
        return false;
      }
    }

    setTagValidationError(null); // Clear error if valid
    return true;
  }, []);

  // Check if we can add a new pending tag
  const canAddPendingTag = useMemo(() => {
    const searchTrimmed = searchQuery.trim();
    // Skip per-tag validation for bulk (comma-separated) input — handled in processBulkTagInput
    const isBulkInput = searchTrimmed.includes(",");
    return (
      searchTrimmed &&
      searchTrimmed.length > 0 &&
      (isBulkInput || isValidTagName(searchTrimmed)) &&
      !exactMatch &&
      !pendingMatch &&
      !selectedTags.some(
        (tag) => tag.toLowerCase() === searchTrimmed.toLowerCase()
      ) && // Prevent duplicate selection
      selectedTags.length < maxTags &&
      !disabled
    );
  }, [
    searchQuery,
    isValidTagName,
    exactMatch,
    pendingMatch,
    selectedTags,
    maxTags,
    disabled,
  ]);

  // Process bulk tag input (comma-separated)
  const processBulkTagInput = useCallback(
    (input: string) => {
      const tagNames = input
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);

      const validTags: string[] = [];
      const invalidTags: string[] = [];
      const duplicateTags: string[] = [];

      for (const tagName of tagNames) {
        // Check if tag already exists in selected tags
        if (
          selectedTags.some(
            (tag) => tag.toLowerCase() === tagName.toLowerCase()
          ) ||
          pendingTags.some((tag) => tag.toLowerCase() === tagName.toLowerCase())
        ) {
          duplicateTags.push(tagName);
          continue;
        }

        // Validate tag name
        if (isValidTagName(tagName)) {
          validTags.push(tagName);
        } else {
          invalidTags.push(tagName);
        }
      }

      // Add valid tags if we don't exceed the limit
      if (validTags.length > 0) {
        const tagsToAdd = validTags.slice(0, maxTags - selectedTags.length);
        const newPendingTags = [...pendingTags];
        const newSelectedTags = [...selectedTags];

        for (const tagName of tagsToAdd) {
          // Check if tag exists in available tags
          const existingTag = availableTags.find(
            (tag) => tag.name.toLowerCase() === tagName.toLowerCase()
          );

          if (existingTag) {
            // Add existing tag
            newSelectedTags.push(existingTag.name);
          } else {
            // Add as pending tag
            newPendingTags.push(tagName);
            newSelectedTags.push(tagName);
          }
        }

        onTagsChange(newSelectedTags);
        if (onPendingTagsChange) {
          onPendingTagsChange(newPendingTags);
        }

        // Show feedback
        if (tagsToAdd.length > 0) {
          setTagValidationError(null);
        }
        if (invalidTags.length > 0) {
          setTagValidationError(`Invalid tags: ${invalidTags.join(", ")}`);
        }
        if (duplicateTags.length > 0) {
          setTagValidationError(
            `Duplicate tags ignored: ${duplicateTags.join(", ")}`
          );
        }
      }

      setSearchQuery("");
    },
    [
      selectedTags,
      pendingTags,
      availableTags,
      maxTags,
      isValidTagName,
      onTagsChange,
      onPendingTagsChange,
    ]
  );

  // Handle key down events on search input
  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();

        const searchTrimmed = searchQuery.trim();
        if (!searchTrimmed) return;

        // Check if input contains commas (bulk input)
        if (searchTrimmed.includes(",")) {
          processBulkTagInput(searchTrimmed);
          return;
        }

        // Perform validation here before attempting to add/select
        if (!isValidTagName(searchTrimmed)) {
          // Error message already set by isValidTagName
          return;
        }

        if (exactMatch) {
          // If exact match exists, select it
          if (selectedTags.includes(exactMatch.name)) {
            // Remove tag
            onTagsChange(selectedTags.filter((tag) => tag !== exactMatch.name));
          } else {
            // Add tag (if under limit)
            if (selectedTags.length < maxTags) {
              onTagsChange([...selectedTags, exactMatch.name]);
            }
          }
          setSearchQuery(""); // Clear search after selection/deselection
        } else if (pendingMatch) {
          // If pending match exists, select it
          if (selectedTags.includes(pendingMatch)) {
            // Remove tag
            onTagsChange(selectedTags.filter((tag) => tag !== pendingMatch));
          } else {
            // Add tag (if under limit)
            if (selectedTags.length < maxTags) {
              onTagsChange([...selectedTags, pendingMatch]);
            }
          }
          setSearchQuery(""); // Clear search after selection/deselection
        } else if (canAddPendingTag) {
          // Add as pending tag, ensuring no duplicates
          const newTagName = searchTrimmed;

          // Double-check for duplicates (case-insensitive)
          const isDuplicate =
            selectedTags.some(
              (tag) => tag.toLowerCase() === newTagName.toLowerCase()
            ) ||
            pendingTags.some(
              (tag) => tag.toLowerCase() === newTagName.toLowerCase()
            );

          if (!isDuplicate && onPendingTagsChange) {
            onPendingTagsChange([...pendingTags, newTagName]);
            onTagsChange([...selectedTags, newTagName]);
            setSearchQuery("");
          }
        }
      }
    },
    [
      searchQuery,
      exactMatch,
      pendingMatch,
      canAddPendingTag,
      selectedTags,
      onTagsChange,
      onPendingTagsChange,
      pendingTags,
      maxTags,
      isValidTagName,
      processBulkTagInput,
    ]
  );

  // Handle tag selection/deselection
  const handleTagClick = useCallback(
    (tagName: string) => {
      if (disabled) return;

      // When clicking an existing tag, we don't need to validate its name,
      // as it's assumed to be pre-existing and valid from the database.
      if (selectedTags.includes(tagName)) {
        // Remove tag
        onTagsChange(selectedTags.filter((tag) => tag !== tagName));
      } else {
        // Add tag (if under limit)
        if (selectedTags.length < maxTags) {
          onTagsChange([...selectedTags, tagName]);
        }
      }
    },
    [selectedTags, onTagsChange, maxTags, disabled]
  );

  // Remove selected tag
  const handleRemoveTag = useCallback(
    (tagName: string) => {
      if (disabled) return;
      onTagsChange(selectedTags.filter((tag) => tag !== tagName));

      // Also remove from pending tags if it's a pending tag
      if (pendingTags.includes(tagName) && onPendingTagsChange) {
        onPendingTagsChange(pendingTags.filter((tag) => tag !== tagName));
      }
    },
    [selectedTags, onTagsChange, disabled, pendingTags, onPendingTagsChange]
  );

  // Clear search
  const clearSearch = useCallback(() => {
    setSearchQuery("");
    setTagValidationError(null); // Clear validation error when clearing search
  }, []);

  return (
    <div className={cn("space-y-4", className)}>
      {/* Selected Tags */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">
            Selected Tags ({selectedTags.length}/{maxTags})
          </Label>
          {selectedTags.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onTagsChange([]);
                if (onPendingTagsChange) {
                  onPendingTagsChange([]);
                }
              }}
              disabled={disabled}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Clear all
            </Button>
          )}
        </div>

        {selectedTags.length > 0 ? (
          <div className="flex flex-wrap gap-2 p-3 border rounded-lg bg-muted/30 min-h-[44px]">
            {/* Existing tags */}
            {selectedExistingTagObjects.map((tag) => (
              <Badge
                key={tag.id}
                variant="default"
                className="cursor-pointer flex items-center gap-1 hover:bg-primary/80"
                onClick={() => handleRemoveTag(tag.name)}
              >
                {tag.name}
                <X className="w-3 h-3" />
              </Badge>
            ))}
            {/* Pending tags */}
            {selectedPendingTags.map((tagName) => (
              <Badge
                key={`pending-${tagName}`}
                variant="default"
                className="cursor-pointer flex items-center gap-1 hover:bg-primary/80"
                onClick={() => handleRemoveTag(tagName)}
              >
                {tagName}
                <X className="w-3 h-3" />
              </Badge>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center p-3 border rounded-lg bg-muted/30 min-h-[44px] text-sm text-muted-foreground">
            No tags selected. Click on available tags below to add them.
          </div>
        )}
      </div>

      {/* Search Input */}
      <div className="space-y-2">
        <Label htmlFor="tag-search" className="text-sm font-medium">
          Search Available Tags
        </Label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            id="tag-search"
            type="text"
            placeholder="Search tags, add new ones, or use commas for bulk input. (e.g., 'background, ocean, bluesky')"
            value={searchQuery}
            onChange={(e) => {
              const value = e.target.value;
              // Allow commas for bulk input, plus valid characters for tag names
              if (value === "" || /^[a-zA-Z0-9\s\-_,]*$/.test(value)) {
                setSearchQuery(value.substring(0, 1000)); // Allow large bulk input pastes
                // Validate on change to provide immediate feedback
                if (value.trim()) {
                  // If input contains commas, don't validate until Enter is pressed
                  if (!value.includes(",")) {
                    isValidTagName(value); // This will set tagValidationError
                  } else {
                    setTagValidationError(null); // Clear error for bulk input
                  }
                } else {
                  setTagValidationError(null); // Clear error if input is empty
                }
              } else {
                setTagValidationError(
                  "Invalid characters detected. Use letters, numbers, spaces, hyphens, underscores, and commas."
                );
              }
            }}
            onKeyDown={handleSearchKeyDown}
            disabled={disabled}
            className="pl-10 pr-10"
          />
          {searchQuery && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearSearch}
              disabled={disabled}
              className="absolute right-1 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>

        {/* Show add new tag hint */}
        {canAddPendingTag &&
          !tagValidationError &&
          !searchQuery.includes(",") && (
            <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <Plus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <p className="text-sm text-blue-700 dark:text-blue-300">
                Press{" "}
                <kbd className="px-1.5 py-0.5 text-xs bg-blue-100 dark:bg-blue-900 rounded border">
                  Enter
                </kbd>{" "}
                to add &ldquo;{searchQuery}&rdquo; as a new tag.
              </p>
            </div>
          )}

        {/* Show bulk input hint */}
        {searchQuery.includes(",") && !tagValidationError && (
          <div className="flex items-center gap-2 px-3 py-2 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg">
            <Plus className="w-4 h-4 text-green-600 dark:text-green-400" />
            <p className="text-sm text-green-700 dark:text-green-300">
              Press{" "}
              <kbd className="px-1.5 py-0.5 text-xs bg-green-100 dark:bg-green-900 rounded border">
                Enter
              </kbd>{" "}
              to add multiple tags:{" "}
              {searchQuery
                .split(",")
                .map((tag) => `"${tag.trim()}"`)
                .join(", ")}
            </p>
          </div>
        )}

        {/* Show validation error for invalid tag names */}
        {tagValidationError && (
          <div className="flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg">
            <X className="w-4 h-4 text-red-600 dark:text-red-400" />
            <p className="text-sm text-red-700 dark:text-red-300">
              {tagValidationError}
            </p>
          </div>
        )}
      </div>

      {/* Suggested Tags */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">
            Suggested Tags ({displayTags.length}/{filteredAvailableTags.length})
          </Label>
          {filteredAvailableTags.length > 20 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowAll(!showAll)}
              className="h-auto p-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {showAll ? "Show less" : "Show all"}
            </Button>
          )}
        </div>

        {displayTags.length > 0 ? (
          <div className="flex flex-wrap gap-2 p-3 border rounded-lg max-h-[120px] overflow-y-auto">
            {displayTags.map((tag) => {
              const isSelected = selectedTags.includes(tag.name);
              const canAdd = !isSelected && selectedTags.length < maxTags;

              return (
                <Badge
                  key={tag.id}
                  variant={isSelected ? "default" : "outline"}
                  className={cn(
                    "cursor-pointer transition-all duration-200 flex items-center gap-1",
                    isSelected && "bg-primary text-primary-foreground",
                    !isSelected &&
                      canAdd &&
                      "hover:bg-primary/10 hover:border-primary/50",
                    !isSelected && !canAdd && "opacity-50 cursor-not-allowed",
                    disabled && "cursor-not-allowed opacity-50"
                  )}
                  onClick={() => handleTagClick(tag.name)}
                >
                  {!isSelected && canAdd && <Plus className="w-3 h-3" />}
                  {isSelected && <X className="w-3 h-3" />}
                  {tag.name}
                </Badge>
              );
            })}
          </div>
        ) : (
          <div className="flex items-center justify-center p-6 border rounded-lg bg-muted/30 text-sm text-muted-foreground">
            {searchQuery
              ? "No tags found matching your search."
              : "No tags available."}
          </div>
        )}
      </div>

      {/* Tag Limit Warning */}
      {selectedTags.length >= maxTags && (
        <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <p className="text-sm text-amber-800 dark:text-amber-200">
            <strong>Tag limit reached:</strong> You can only select up to{" "}
            {maxTags} tags. Remove some tags to add new ones.
          </p>
        </div>
      )}

      {/* Pending Tags Info (disabled for now) */}
      {/* {selectedPendingTags.length > 0 && (
        <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <div className="flex items-start gap-2">
            <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5" />
            <div>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                <strong>Pending tags:</strong> {selectedPendingTags.length} tag
                {selectedPendingTags.length === 1 ? "" : "s"} will be created
                when you submit the form.
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                {selectedPendingTags.join(", ")}
              </p>
            </div>
          </div>
        </div>
      )} */}

      {/* Hidden input for form submission */}
      <input type="hidden" name="tags" value={selectedTags.join(", ")} />
      <input type="hidden" name="pendingTags" value={pendingTags.join(", ")} />
    </div>
  );
}
