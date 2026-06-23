import * as React from "react";

import { Cancel01Icon, SentIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import * as z from "zod";

import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import { cn } from "@/lib/utils";

import type {
	HttpDispatchRequest,
	HttpDispatchResponse,
} from "@/workers/ballerina-worker-api";

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

const keyValuePairSchema = z.object({
	key: z.string(),
	value: z.string(),
});

const keyValuePairsSchema = z
	.array(keyValuePairSchema)
	.superRefine((entries, ctx) => {
		entries.forEach((entry, index) => {
			const hasKey = entry.key.trim().length > 0;
			const hasValue = entry.value.trim().length > 0;

			if (hasKey === hasValue) return;

			ctx.addIssue({
				code: "custom",
				message: hasKey ? "Enter a value." : "Enter a key.",
				path: [index, hasKey ? "value" : "key"],
			});
		});
	});

const formSchema = z.object({
	method: z.enum(HTTP_METHODS),
	listener: z.string().min(1),
	path: z.string().refine((value) => value.trim().length > 0, {
		message: "Enter a request path.",
	}),
	query: keyValuePairsSchema,
	headers: keyValuePairsSchema,
	body: z.string(),
});

type FormValues = z.infer<typeof formSchema>;

type KeyValueEntry = z.infer<typeof keyValuePairSchema>;

type ResponseState = {
	statusCode: number | null;
	body: string;
	headers: KeyValueEntry[];
	error?: string;
};

type FieldArrayName = "query" | "headers";

type Props = {
	listenerHosts: string[];
	dispatchHttpRequest: (
		request: HttpDispatchRequest,
	) => Promise<HttpDispatchResponse>;
};

function isKeyValueEntryEmpty(
	entry: { key: string; value: string } | undefined,
) {
	return !entry?.key.trim() && !entry?.value.trim();
}

function areEntriesEqual(left: KeyValueEntry[], right: KeyValueEntry[]) {
	return (
		left.length === right.length &&
		left.every(
			(entry, index) =>
				entry.key === right[index]?.key && entry.value === right[index]?.value,
		)
	);
}

function KeyValueFields({
	form,
	name,
}: {
	form: ReturnType<typeof useForm<FormValues>>;
	name: FieldArrayName;
}) {
	const { fields, append, remove, replace } = useFieldArray({
		control: form.control,
		name,
	});
	const entries = useWatch({ control: form.control, name });

	React.useEffect(() => {
		if (fields.length === 0) {
			append({ key: "", value: "" }, { shouldFocus: false });
			return;
		}

		const lastEntry = entries?.[fields.length - 1];
		const previousEntry = entries?.[fields.length - 2];

		if (
			fields.length > 1 &&
			isKeyValueEntryEmpty(lastEntry) &&
			isKeyValueEntryEmpty(previousEntry)
		) {
			remove(fields.length - 1);
			return;
		}

		if (!isKeyValueEntryEmpty(lastEntry)) {
			append({ key: "", value: "" }, { shouldFocus: false });
		}
	}, [append, entries, fields.length, remove]);

	function normalizeEntries() {
		const currentEntries = form.getValues(name);
		const nextEntries = [...currentEntries];

		while (
			nextEntries.length > 1 &&
			isKeyValueEntryEmpty(nextEntries.at(-1)) &&
			isKeyValueEntryEmpty(nextEntries.at(-2))
		) {
			nextEntries.pop();
		}

		if (nextEntries.length === 0 || !isKeyValueEntryEmpty(nextEntries.at(-1))) {
			nextEntries.push({ key: "", value: "" });
		}

		if (!areEntriesEqual(currentEntries, nextEntries)) {
			replace(nextEntries);
		}
	}

	function handleRemove(index: number) {
		const nextEntries = form
			.getValues(name)
			.filter((_, entryIndex) => entryIndex !== index);

		replace(nextEntries);
		queueMicrotask(normalizeEntries);
	}

	return (
		<div className="flex flex-col gap-2">
			{fields.map((field, index) => {
				const fieldErrors = form.formState.errors[name]?.[index];
				const keyField = form.register(`${name}.${index}.key`);
				const valueField = form.register(`${name}.${index}.value`);

				return (
					<div key={field.id} className="flex items-center gap-2">
						<Input
							{...keyField}
							placeholder="Key"
							autoComplete="off"
							aria-label={`${name} key ${index + 1}`}
							aria-invalid={!!fieldErrors?.key}
							onBlur={(event) => {
								void keyField.onBlur(event);
								queueMicrotask(normalizeEntries);
							}}
						/>
						<Input
							{...valueField}
							placeholder="Value"
							autoComplete="off"
							aria-label={`${name} value ${index + 1}`}
							aria-invalid={!!fieldErrors?.value}
							onBlur={(event) => {
								void valueField.onBlur(event);
								queueMicrotask(normalizeEntries);
							}}
						/>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							aria-label={`Remove ${name} entry ${index + 1}`}
							onClick={() => handleRemove(index)}
						>
							<HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.5} />
						</Button>
					</div>
				);
			})}
		</div>
	);
}

function toHeaderEntries(
	headers: HttpDispatchResponse["headers"],
): KeyValueEntry[] {
	return Object.entries(headers).flatMap(([key, values]) =>
		values.map((value) => ({ key, value })),
	);
}

function buildHeaderRecord(
	entries: KeyValueEntry[],
): HttpDispatchRequest["headers"] {
	const headers: Record<string, string | string[]> = {};
	for (const entry of entries) {
		const key = entry.key.trim();
		const value = entry.value.trim();
		if (!key || !value) continue;

		const existing = headers[key];
		if (Array.isArray(existing)) {
			existing.push(value);
		} else if (typeof existing === "string") {
			headers[key] = [existing, value];
		} else {
			headers[key] = value;
		}
	}

	return headers;
}

function buildQueryString(url: URL, entries: KeyValueEntry[]) {
	const params = new URLSearchParams(url.search);
	for (const entry of entries) {
		const key = entry.key.trim();
		const value = entry.value.trim();
		if (!key || !value) continue;
		params.append(key, value);
	}

	return params.toString();
}

function parseRequestPath(value: string, listenerHost: string) {
	const trimmed = value.trim();
	const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
	return new URL(path, `http://${listenerHost}`);
}

function buildHttpDispatchRequest(values: FormValues): HttpDispatchRequest {
	const url = parseRequestPath(values.path, values.listener);
	return {
		method: values.method,
		host: url.host,
		path: url.pathname || "/",
		query: buildQueryString(url, values.query),
		headers: buildHeaderRecord(values.headers),
		body: values.body,
	};
}

function ResponseSection({ response }: { response: ResponseState | null }) {
	return (
		<section className="border-t pt-4">
			<Tabs defaultValue="body" className="gap-3">
				<div className="flex items-center justify-between gap-3">
					<div className="flex items-center gap-2">
						<h3 className="text-sm font-medium text-foreground">Response</h3>
						{response?.statusCode !== null &&
							response?.statusCode !== undefined && (
								<span className="border px-1.5 py-0.5 text-xs text-muted-foreground">
									{response.statusCode}
								</span>
							)}
					</div>
					<TabsList className="w-fit shrink-0 border border-border bg-muted p-0">
						<TabsTrigger
							value="body"
							className="px-4 not-last:border-r border-0 border-border"
						>
							Body
						</TabsTrigger>
						<TabsTrigger
							value="headers"
							className="px-4 not-last:border-r border-0 border-border"
						>
							Headers
						</TabsTrigger>
					</TabsList>
				</div>
				<TabsContent value="body" className="mt-0" keepMounted>
					<pre
						className={cn(
							"min-h-24 border p-3 text-xs whitespace-pre-wrap wrap-break-word text-muted-foreground",
							response?.error && "text-destructive",
						)}
					>
						{response?.error || response?.body || "Send a request first."}
					</pre>
				</TabsContent>
				<TabsContent value="headers" className="mt-0" keepMounted>
					<div className="min-h-24 border bg-muted/30 p-3 text-xs text-muted-foreground">
						{response?.headers.length ? (
							<div className="flex flex-col gap-2">
								{response.headers.map((header) => (
									<div
										key={`${header.key}-${header.value}`}
										className="grid grid-cols-2 gap-2"
									>
										<span className="text-foreground">{header.key}</span>
										<span>{header.value}</span>
									</div>
								))}
							</div>
						) : (
							"No response headers."
						)}
					</div>
				</TabsContent>
			</Tabs>
		</section>
	);
}

export function TryItPanel({ listenerHosts, dispatchHttpRequest }: Props) {
	const [response, setResponse] = React.useState<ResponseState | null>(null);
	const form = useForm<FormValues>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			method: "GET",
			listener: listenerHosts[0] ?? "",
			path: "/",
			query: [{ key: "", value: "" }],
			headers: [{ key: "", value: "" }],
			body: "",
		},
	});

	React.useEffect(() => {
		const listener = form.getValues("listener");
		if (!listenerHosts.includes(listener)) {
			form.setValue("listener", listenerHosts[0] ?? "");
		}
	}, [form, listenerHosts]);

	async function onSubmit(data: FormValues) {
		try {
			const httpResponse = await dispatchHttpRequest(
				buildHttpDispatchRequest(data),
			);
			setResponse({
				statusCode: httpResponse.statusCode,
				body: httpResponse.body,
				headers: toHeaderEntries(httpResponse.headers),
			});
		} catch (error) {
			setResponse({
				statusCode: null,
				body: "",
				headers: [],
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	return (
		<form
			className="flex flex-col gap-4"
			onSubmit={form.handleSubmit(onSubmit)}
			autoComplete="off"
		>
			<FieldGroup>
				<div className="flex items-start gap-0">
					<Controller
						control={form.control}
						name="method"
						render={({ field, fieldState }) => (
							<Field
								data-invalid={fieldState.invalid}
								className="w-24 shrink-0"
							>
								<FieldLabel htmlFor={field.name} className="sr-only">
									HTTP method
								</FieldLabel>
								<Select value={field.value} onValueChange={field.onChange}>
									<SelectTrigger
										id={field.name}
										aria-invalid={fieldState.invalid}
										className="w-24 shrink-0"
									>
										<SelectValue />
									</SelectTrigger>
									<SelectContent align="end">
										{HTTP_METHODS.map((httpMethod) => (
											<SelectItem key={httpMethod} value={httpMethod}>
												{httpMethod}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</Field>
						)}
					/>
					<Controller
						control={form.control}
						name="listener"
						render={({ field, fieldState }) => (
							<Field
								data-invalid={fieldState.invalid}
								className="w-24 shrink-0"
							>
								<FieldLabel htmlFor={field.name} className="sr-only">
									Listeners
								</FieldLabel>
								<Select value={field.value} onValueChange={field.onChange}>
									<SelectTrigger
										id={field.name}
										aria-invalid={fieldState.invalid}
										className="w-24 shrink-0"
									>
										<SelectValue />
									</SelectTrigger>
									<SelectContent align="end">
										{listenerHosts.map((host) => (
											<SelectItem key={host} value={host}>
												{host.split(":").at(-1) ?? host}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</Field>
						)}
					/>
					<Controller
						control={form.control}
						name="path"
						render={({ field, fieldState }) => (
							<Field
								data-invalid={fieldState.invalid}
								className="min-w-0 flex-1"
							>
								<FieldLabel htmlFor={field.name} className="sr-only">
									Request path
								</FieldLabel>
								<Input
									{...field}
									id={field.name}
									placeholder="/"
									autoComplete="off"
									aria-invalid={fieldState.invalid}
								/>
							</Field>
						)}
					/>
					<Button
						type="submit"
						className="shrink-0"
						variant="outline"
						disabled={form.formState.isSubmitting}
					>
						{form.formState.isSubmitting ? (
							"[...]"
						) : (
							<>
								<HugeiconsIcon icon={SentIcon} strokeWidth={1.5} />
								Send
							</>
						)}
					</Button>
				</div>
			</FieldGroup>

			<Tabs defaultValue="query" className="gap-3">
				<TabsList className="w-fit border border-border bg-muted p-0">
					<TabsTrigger
						value="query"
						className="px-4 not-last:border-r border-0 border-border"
					>
						Query
					</TabsTrigger>
					<TabsTrigger
						value="headers"
						className="px-4 not-last:border-r border-0 border-border"
					>
						Headers
					</TabsTrigger>
					<TabsTrigger
						value="body"
						className="px-4 not-last:border-r border-0 border-border"
					>
						Body
					</TabsTrigger>
				</TabsList>
				<TabsContent value="query" className="mt-0" keepMounted>
					<KeyValueFields form={form} name="query" />
				</TabsContent>
				<TabsContent value="headers" className="mt-0" keepMounted>
					<KeyValueFields form={form} name="headers" />
				</TabsContent>
				<TabsContent value="body" className="mt-0" keepMounted>
					<Field>
						<FieldLabel htmlFor="try-it-body" className="sr-only">
							Body
						</FieldLabel>
						<Textarea
							{...form.register("body")}
							id="try-it-body"
							placeholder="Request body"
							autoComplete="off"
							className="min-h-32 resize-y"
						/>
					</Field>
				</TabsContent>
			</Tabs>

			<ResponseSection response={response} />
		</form>
	);
}
