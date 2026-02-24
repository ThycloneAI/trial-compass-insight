import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Search, Filter, ChevronDown, ChevronUp, Pill, Stethoscope, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { SearchParams, SearchMode } from "@/lib/api";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

// Schema with conditional validation
const searchSchema = z.object({
  drug: z.string().max(200).optional(),
  condition: z.string().max(500).optional(),
  biomarker: z.string().max(200).optional(),
  studyType: z.string().optional(),
  minDate: z.string().optional(),
  maxDate: z.string().optional(),
  maxResults: z.number().min(1).max(500).optional(),
}).refine(
  (data) => (data.drug && data.drug.trim().length > 0) || (data.condition && data.condition.trim().length > 0),
  {
    message: "At least one of Drug Name or Condition is required",
    path: ["drug"], // Show error on drug field
  }
);

type SearchFormData = z.infer<typeof searchSchema>;

interface SearchFormProps {
  onSearch: (params: SearchParams) => void;
  isLoading: boolean;
}

const PHASES = [
  { value: "early_1", label: "Early Phase 1" },
  { value: "1", label: "Phase 1" },
  { value: "2", label: "Phase 2" },
  { value: "3", label: "Phase 3" },
  { value: "4", label: "Phase 4" },
];

const STATUSES = [
  { value: "recruiting", label: "Recruiting" },
  { value: "active_not_recruiting", label: "Active, not recruiting" },
  { value: "completed", label: "Completed" },
  { value: "not_yet_recruiting", label: "Not yet recruiting" },
  { value: "terminated", label: "Terminated" },
  { value: "withdrawn", label: "Withdrawn" },
  { value: "suspended", label: "Suspended" },
];

export function SearchForm({ onSearch, isLoading }: SearchFormProps) {
  const [showFilters, setShowFilters] = useState(false);
  const [selectedPhases, setSelectedPhases] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [searchMode, setSearchMode] = useState<SearchMode>("combined");
  
  const drugInputRef = useRef<HTMLInputElement>(null);
  const conditionInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
    trigger,
  } = useForm<SearchFormData>({
    resolver: zodResolver(searchSchema),
    defaultValues: {
      maxResults: 50,
    },
  });

  // Focus the appropriate input when search mode changes
  useEffect(() => {
    if (searchMode === "drug") {
      drugInputRef.current?.focus();
    } else if (searchMode === "condition") {
      conditionInputRef.current?.focus();
    }
  }, [searchMode]);

  const onSubmit = (data: SearchFormData) => {
    onSearch({
      drug: data.drug || undefined,
      condition: data.condition || undefined,
      biomarker: data.biomarker || undefined,
      phase: selectedPhases.length > 0 ? selectedPhases : undefined,
      status: selectedStatuses.length > 0 ? selectedStatuses : undefined,
      studyType: data.studyType || undefined,
      minDate: data.minDate || undefined,
      maxDate: data.maxDate || undefined,
      maxResults: data.maxResults,
      searchMode,
    });
  };

  const togglePhase = (phase: string) => {
    setSelectedPhases((prev) =>
      prev.includes(phase)
        ? prev.filter((p) => p !== phase)
        : [...prev, phase]
    );
  };

  const toggleStatus = (status: string) => {
    setSelectedStatuses((prev) =>
      prev.includes(status)
        ? prev.filter((s) => s !== status)
        : [...prev, status]
    );
  };

  const handleModeChange = (value: string) => {
    if (value) {
      setSearchMode(value as SearchMode);
    }
  };

  // Get registration props without ref for drug and condition
  const { ref: drugRef, ...drugRegister } = register("drug");
  const { ref: conditionRef, ...conditionRegister } = register("condition");

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Search Mode Toggle */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Search Mode</Label>
        <ToggleGroup 
          type="single" 
          value={searchMode} 
          onValueChange={handleModeChange}
          className="justify-start"
        >
          <ToggleGroupItem value="drug" aria-label="Search by drug" className="gap-2">
            <Pill className="h-4 w-4" />
            Drug
          </ToggleGroupItem>
          <ToggleGroupItem value="condition" aria-label="Search by condition" className="gap-2">
            <Stethoscope className="h-4 w-4" />
            Condition
          </ToggleGroupItem>
          <ToggleGroupItem value="combined" aria-label="Combined search" className="gap-2">
            <Layers className="h-4 w-4" />
            Combined
          </ToggleGroupItem>
        </ToggleGroup>
        <p className="text-xs text-muted-foreground">
          {searchMode === "drug" && "Search by drug/intervention name. Condition is optional."}
          {searchMode === "condition" && "Search by disease/condition. Drug is optional."}
          {searchMode === "combined" && "Search using both drug and condition. At least one is required."}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Drug Input */}
        <div className="space-y-2">
          <Label htmlFor="drug" className="text-sm font-medium">
            Drug Name {searchMode === "drug" && <span className="text-destructive">*</span>}
          </Label>
          <Input
            id="drug"
            placeholder={searchMode === "condition" ? "Optional - e.g., Pembrolizumab" : "e.g., Pembrolizumab, Keytruda"}
            {...drugRegister}
            ref={(e) => {
              drugRef(e);
              (drugInputRef as any).current = e;
            }}
            className="h-11"
          />
          {errors.drug && (
            <p className="text-sm text-destructive">{errors.drug.message}</p>
          )}
        </div>

        {/* Indication Input */}
        <div className="space-y-2">
          <Label htmlFor="condition" className="text-sm font-medium">
            Indication / Condition {searchMode === "condition" && <span className="text-destructive">*</span>}
          </Label>
          <Input
            id="condition"
            placeholder={searchMode === "drug" ? "Optional - e.g., NSCLC" : "e.g., Non-small cell lung cancer"}
            {...conditionRegister}
            ref={(e) => {
              conditionRef(e);
              (conditionInputRef as any).current = e;
            }}
            className="h-11"
          />
        </div>

        {/* Biomarker Input */}
        <div className="space-y-2">
          <Label htmlFor="biomarker" className="text-sm font-medium">
            Biomarker / Subpopulation
          </Label>
          <Input
            id="biomarker"
            placeholder="e.g., PD-L1, EGFR mutation"
            {...register("biomarker")}
            className="h-11"
          />
        </div>
      </div>

      {/* Filters Collapsible */}
      <Collapsible open={showFilters} onOpenChange={setShowFilters}>
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
          >
            <Filter className="h-4 w-4" />
            Advanced Filters
            {showFilters ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-4 space-y-6 animate-slide-up">
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-6">
            {/* Phase Selection */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Phase</Label>
              <div className="flex flex-wrap gap-3">
                {PHASES.map((phase) => (
                  <label
                    key={phase.value}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedPhases.includes(phase.value)}
                      onCheckedChange={() => togglePhase(phase.value)}
                    />
                    <span className="text-sm">{phase.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Status Selection */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Recruitment Status</Label>
              <div className="flex flex-wrap gap-3">
                {STATUSES.map((status) => (
                  <label
                    key={status.value}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedStatuses.includes(status.value)}
                      onCheckedChange={() => toggleStatus(status.value)}
                    />
                    <span className="text-sm">{status.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {/* Study Type */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Study Type</Label>
                <Select onValueChange={(value) => setValue("studyType", value)}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INTERVENTIONAL">Interventional</SelectItem>
                    <SelectItem value="OBSERVATIONAL">Observational</SelectItem>
                    <SelectItem value="EXPANDED_ACCESS">Expanded Access</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Date Range */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Last Updated After</Label>
                <Input
                  type="date"
                  {...register("minDate")}
                  className="h-10"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Last Updated Before</Label>
                <Input
                  type="date"
                  {...register("maxDate")}
                  className="h-10"
                />
              </div>
            </div>

            {/* Max Results */}
            <div className="max-w-xs space-y-2">
              <Label className="text-sm font-medium">Max Results</Label>
              <Select
                defaultValue="50"
                onValueChange={(value) => setValue("maxResults", parseInt(value))}
              >
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                  <SelectItem value="200">200</SelectItem>
                  <SelectItem value="500">500</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Search Button */}
      <Button
        type="submit"
        size="lg"
        disabled={isLoading}
        className="w-full md:w-auto min-w-[200px] h-12 text-base font-medium"
      >
        {isLoading ? (
          <span className="flex items-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Searching...
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Search Trials
          </span>
        )}
      </Button>
    </form>
  );
}
