import * as React from 'react';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle
} from '@/components/ui/card';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
	ChartContainer,
	ChartLegend,
	ChartLegendContent,
	ChartTooltip,
	ChartTooltipContent,
	type ChartConfig
} from '@/components/ui/chart';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue
} from '@/components/ui/select';
import { Bar, BarChart, CartesianGrid, Rectangle, XAxis, YAxis } from 'recharts';
import { Pie, PieChart } from 'recharts';
import { Trash2 } from 'lucide-react';

type HistoryRow = {
	project: string;
	date: string;
	ms: number;
};

type StatsData = {
	rows: HistoryRow[];
	languageHistory: Record<string, Record<string, Record<string, number>>>;
	frameworkHistory: Record<string, Record<string, Record<string, number>>>;
};

declare global {
	interface Window {
		__TIMETRACK_DATA__?: StatsData;
	}
}

const mockRows: HistoryRow[] = [
	{ project: 'timetrack', date: '2026-01-27', ms: 2_760_000 },
	{ project: 'timetrack', date: '2026-01-28', ms: 5_820_000 },
	{ project: 'timetrack', date: '2026-01-29', ms: 3_180_000 },
	{ project: 'timetrack', date: '2026-01-30', ms: 4_560_000 },
	{ project: 'client-portal', date: '2026-01-27', ms: 1_200_000 },
	{ project: 'client-portal', date: '2026-01-28', ms: 3_900_000 },
	{ project: 'client-portal', date: '2026-01-29', ms: 2_640_000 },
	{ project: 'research-lab', date: '2026-01-30', ms: 1_500_000 }
];

const mockLanguageHistory = {
	timetrack: {
		'2026-01-28': { typescript: 3_600_000, json: 600_000 },
		'2026-01-29': { typescript: 2_400_000 }
	},
	'client-portal': {
		'2026-01-28': { javascript: 3_000_000 },
		'2026-01-29': { javascript: 1_800_000, css: 900_000 }
	}
};

const mockFrameworkHistory = {
	timetrack: {
		'2026-01-28': { 'Next.js': 3_600_000 },
		'2026-01-29': { 'Next.js': 2_400_000 }
	},
	'client-portal': {
		'2026-01-28': { React: 3_000_000 },
		'2026-01-29': { React: 2_700_000 }
	}
};

const data =
	window.__TIMETRACK_DATA__?.rows?.length
		? window.__TIMETRACK_DATA__
		: { rows: mockRows, languageHistory: mockLanguageHistory, frameworkHistory: mockFrameworkHistory };

function formatDuration(ms: number): string {
	const totalSeconds = Math.floor(ms / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	return `${hours.toString().padStart(2, '0')}h ${minutes
		.toString()
		.padStart(2, '0')}m`;
}

function getDateKeyUtc(date: Date): string {
	return date.toISOString().slice(0, 10);
}

function parseDateKeyUtc(dateKey: string): Date {
	return new Date(`${dateKey}T00:00:00Z`);
}

function hashString(value: string): number {
	let hash = 0;
	for (let i = 0; i < value.length; i += 1) {
		hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
	}
	return hash;
}

function labelColor(label: string, index: number): string {
	const hash = hashString(label);
	const hue = 135 + ((hash + index * 37) % 18);
	const saturation = 55 + (hash % 25);
	const lightness = 34 + ((hash >> 3) % 24);
	return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

function renderRoundedTopBar(dataKey: string) {
	return (props: unknown) => {
		const shapeProps = (props ?? {}) as Record<string, unknown>;
		const payload = shapeProps.payload as { topKey?: string } | undefined;
		const roundTop = payload?.topKey === dataKey;
		return (
			<Rectangle
				{...shapeProps}
				radius={roundTop ? [4, 4, 0, 0] : 0}
			/>
		);
	};
}

function aggregateCategoryTotals(
	history: Record<string, Record<string, Record<string, number>>>,
	start: Date,
	end: Date
): Record<string, number> {
	const totals: Record<string, number> = {};
	for (const project of Object.values(history)) {
		for (const [dateKey, categories] of Object.entries(project)) {
			const date = parseDateKeyUtc(dateKey);
			if (date < start || date > end) {
				continue;
			}
			for (const [label, ms] of Object.entries(categories)) {
				totals[label] = (totals[label] ?? 0) + ms;
			}
		}
	}
	return totals;
}

function buildPieChartData(totals: Record<string, number>) {
	const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
	return entries.map(([label, ms], index) => {
		const key = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
		return {
			key,
			label,
			value: Math.round(ms / 60000),
			fill: `var(--color-${key})`,
			color: labelColor(label, index)
		};
	});
}

function buildPieChartConfig(
	data: Array<{ key: string; label: string; color: string }>
): ChartConfig {
	return data.reduce<ChartConfig>(
		(acc, item) => {
			acc[item.key] = { label: item.label, color: item.color };
			return acc;
		},
		{ value: { label: 'Minutes' } }
	);
}

function getStartOfMonthUtc(date: Date): Date {
	return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function removeNestedEntry(
	history: Record<string, Record<string, Record<string, number>>>,
	projectId: string,
	dateKey: string
): Record<string, Record<string, Record<string, number>>> {
	const project = history[projectId];
	if (!project || !project[dateKey]) {
		return history;
	}
	const nextHistory = { ...history };
	const nextProject = { ...project };
	delete nextProject[dateKey];
	if (Object.keys(nextProject).length === 0) {
		delete nextHistory[projectId];
	} else {
		nextHistory[projectId] = nextProject;
	}
	return nextHistory;
}

export default function App() {
	const initialData = data;
	const vscodeApi = React.useMemo(
		() => (window as { acquireVsCodeApi?: () => { postMessage: (payload: unknown) => void } })
			.acquireVsCodeApi?.(),
		[]
	);
	const [stats, setStats] = React.useState<StatsData>(initialData);
	React.useEffect(() => {
		const handler = (event: MessageEvent) => {
			const message = event.data as { type?: string; payload?: StatsData };
			if (message?.type === 'statsData' && message.payload) {
				setStats(message.payload);
			}
		};
		window.addEventListener('message', handler);
		return () => window.removeEventListener('message', handler);
	}, []);

	const now = new Date();
	const todayKey = getDateKeyUtc(now);
	const startOfMonth = getStartOfMonthUtc(now);
	const [rangeDays, setRangeDays] = React.useState(7);
	const rangeEnd = new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
	);
	const rangeStart = new Date(rangeEnd);
	rangeStart.setUTCDate(rangeStart.getUTCDate() - (rangeDays - 1));
	const rangeDates = Array.from({ length: rangeDays }, (_, index) => {
		const date = new Date(rangeStart);
		date.setUTCDate(date.getUTCDate() + index);
		return date;
	});
	const rangeKeys = rangeDates.map((date) => getDateKeyUtc(date));

	const totals = stats.rows.reduce(
		(acc, row) => {
			acc.all += row.ms;
			if (row.date === todayKey) {
				acc.today += row.ms;
			}
			const rowDate = parseDateKeyUtc(row.date);
			if (rowDate >= rangeStart && rowDate <= rangeEnd) {
				acc.week += row.ms;
			}
			if (rowDate >= startOfMonth) {
				acc.month += row.ms;
			}
			return acc;
		},
		{ today: 0, week: 0, month: 0, all: 0 }
	);

	const rangeRows = stats.rows.filter((row) => {
		const rowDate = parseDateKeyUtc(row.date);
		return rowDate >= rangeStart && rowDate <= rangeEnd;
	});
	const projectNames = Array.from(new Set(rangeRows.map((row) => row.project)));
	const chartKeys = projectNames.map((project, index) => ({
		project,
		key: `project_${index + 1}`,
		color: labelColor(project, index)
	}));
	const chartConfig = chartKeys.reduce<ChartConfig>((acc, item) => {
		acc[item.key] = { label: item.project, color: item.color };
		return acc;
	}, {});
	const chartData = rangeKeys.map((dateKey) => {
		const dayRows = rangeRows.filter((row) => row.date === dateKey);
		const entry: Record<string, number | string> = { date: dateKey };
		for (const item of chartKeys) {
			const totalMs = dayRows
				.filter((row) => row.project === item.project)
				.reduce((sum, row) => sum + row.ms, 0);
			if (totalMs > 0) {
				entry[item.key] = Math.round(totalMs / 60000);
			}
		}
		const topKey = [...chartKeys]
			.reverse()
			.find((item) => typeof entry[item.key] === 'number')?.key;
		if (topKey) {
			entry.topKey = topKey;
		}
		return entry;
	});

	const sortedRows = React.useMemo(() => {
		return [...stats.rows].sort((a, b) => {
			if (a.date === b.date) {
				return a.project.localeCompare(b.project);
			}
			return a.date < b.date ? 1 : -1;
		});
	}, [stats.rows]);
	const pageSize = 10;
	const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
	const [page, setPage] = React.useState(1);
	React.useEffect(() => {
		setPage(1);
	}, [sortedRows.length]);
	const pageRows = sortedRows.slice((page - 1) * pageSize, page * pageSize);

	const languageTotals = aggregateCategoryTotals(
		stats.languageHistory,
		rangeStart,
		rangeEnd
	);
	const frameworkTotals = aggregateCategoryTotals(
		stats.frameworkHistory,
		rangeStart,
		rangeEnd
	);
	const languageChart = buildPieChartData(languageTotals);
	const frameworkChart = buildPieChartData(frameworkTotals);
	const languageConfig = buildPieChartConfig(languageChart);
	const frameworkConfig = buildPieChartConfig(frameworkChart);

	const handleDeleteRow = React.useCallback(
		(row: HistoryRow) => {
			if (row.date === todayKey) {
				return;
			}
			setStats((prev) => {
				const nextRows = prev.rows.filter(
					(item) => item.project !== row.project || item.date !== row.date
				);
				return {
					...prev,
					rows: nextRows,
					languageHistory: removeNestedEntry(
						prev.languageHistory,
						row.project,
						row.date
					),
					frameworkHistory: removeNestedEntry(
						prev.frameworkHistory,
						row.project,
						row.date
					)
				};
			});
			vscodeApi?.postMessage({
				type: 'deleteHistory',
				payload: { project: row.project, date: row.date }
			});
		},
		[todayKey, vscodeApi]
	);

	return (
		<div className="min-h-screen bg-background text-foreground dark">
			<div className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-10">
				<header className="flex flex-col gap-3">
					<p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
						TimeTrack
					</p>
					<div className="flex flex-wrap items-center gap-3">
						<h1 className="text-2xl font-semibold">Active Coding Time</h1>
						<Badge variant="secondary">
							{stats.rows.length} {stats.rows.length === 1 ? 'entry' : 'entries'}
						</Badge>
					</div>
					<p className="text-sm text-muted-foreground">
						Project breakdown by day.
					</p>
				</header>

				<div className="grid gap-4 md:grid-cols-2">
					<Card>
						<CardHeader>
							<CardTitle>Today</CardTitle>
							<CardDescription>{todayKey}</CardDescription>
						</CardHeader>
						<CardContent className="text-2xl font-semibold">
							{formatDuration(totals.today)}
						</CardContent>
					</Card>
					<Card>
						<CardHeader>
							<CardTitle>Selected Range</CardTitle>
							<CardDescription>
								{getDateKeyUtc(rangeStart)} - {getDateKeyUtc(rangeEnd)}
							</CardDescription>
						</CardHeader>
						<CardContent className="text-2xl font-semibold">
							{formatDuration(totals.week)}
						</CardContent>
					</Card>
					<Card>
						<CardHeader>
							<CardTitle>This Month</CardTitle>
							<CardDescription>
								{now.toLocaleString(undefined, { month: 'long', year: 'numeric' })}
							</CardDescription>
						</CardHeader>
						<CardContent className="text-2xl font-semibold">
							{formatDuration(totals.month)}
						</CardContent>
					</Card>
					<Card>
						<CardHeader>
							<CardTitle>All Time</CardTitle>
							<CardDescription>Since install</CardDescription>
						</CardHeader>
						<CardContent className="text-2xl font-semibold">
							{formatDuration(totals.all)}
						</CardContent>
					</Card>
				</div>

				<Card>
					<CardHeader className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
						<div>
							<CardTitle>Project Time Chart</CardTitle>
							<CardDescription>
								{getDateKeyUtc(rangeStart)} - {getDateKeyUtc(rangeEnd)}
							</CardDescription>
						</div>
						<div className="w-full md:w-fit">
							<Select
								value={String(rangeDays)}
								onValueChange={(value) => setRangeDays(Number(value))}
							>
								<SelectTrigger>
									<SelectValue placeholder="Select range" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="7">Last 7 days</SelectItem>
									<SelectItem value="14">Last 14 days</SelectItem>
									<SelectItem value="30">Last 30 days</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</CardHeader>
					<CardContent>
						{chartKeys.length === 0 ? (
							<div className="text-sm text-muted-foreground">
								No data for this range yet.
							</div>
						) : (
							<ChartContainer config={chartConfig} className="h-64 w-full aspect-auto">
								<BarChart data={chartData} accessibilityLayer>
									<CartesianGrid vertical={false} />
									<XAxis
										dataKey="date"
										tickLine={false}
										tickMargin={10}
										axisLine={false}
										tickFormatter={(value) => value.slice(5)}
									/>
									<YAxis
										tickLine={false}
										axisLine={false}
										tickMargin={8}
										tickFormatter={(value) => `${Math.round(value / 60)}h`}
										label={{
											value: 'Time (hours)',
											angle: -90,
											position: 'insideLeft'
										}}
									/>
									<ChartTooltip
										content={
											<ChartTooltipContent
												labelFormatter={(value) => `Date: ${value}`}
												formatter={(value, name) => {
													const minutes = Number(value);
													const ms = minutes * 60000;
													return [
														formatDuration(ms),
														" - ",
														chartConfig[name as keyof ChartConfig]?.label ?? name
													];
												}}
											/>
										}
									/>
									<ChartLegend content={<ChartLegendContent />} />
									{chartKeys.map((item, index) => (
										<Bar
											key={item.key}
											dataKey={item.key}
											stackId="a"
											fill={`var(--color-${item.key})`}
											shape={renderRoundedTopBar(item.key)}
										/>
									))}
								</BarChart>
							</ChartContainer>
						)}
					</CardContent>
				</Card>

				<div className="grid gap-4 md:grid-cols-2">
					<Card className="flex flex-col">
						<CardHeader className="items-center pb-0">
							<CardTitle>Language Breakdown</CardTitle>
							<CardDescription>
								{getDateKeyUtc(rangeStart)} - {getDateKeyUtc(rangeEnd)}
							</CardDescription>
						</CardHeader>
						<CardContent className="flex-1 pb-0">
							{languageChart.length === 0 ? (
								<div className="text-sm text-muted-foreground">
									No language data for this range.
								</div>
							) : (
								<ChartContainer
									config={languageConfig}
									className="mx-auto aspect-square max-h-65"
								>
									<PieChart>
										<ChartTooltip
											cursor={false}
											content={<ChartTooltipContent hideLabel />}
										/>
										<Pie
											data={languageChart}
											dataKey="value"
											nameKey="label"
											innerRadius={60}
										/>
									</PieChart>
								</ChartContainer>
							)}
						</CardContent>
					</Card>

					<Card className="flex flex-col">
						<CardHeader className="items-center pb-0">
							<CardTitle>Framework Breakdown</CardTitle>
							<CardDescription>
								{getDateKeyUtc(rangeStart)} - {getDateKeyUtc(rangeEnd)}
							</CardDescription>
						</CardHeader>
						<CardContent className="flex-1 pb-0">
							{frameworkChart.length === 0 ? (
								<div className="text-sm text-muted-foreground">
									No framework data for this range.
								</div>
							) : (
								<ChartContainer
									config={frameworkConfig}
									className="mx-auto aspect-square max-h-65"
								>
									<PieChart>
										<ChartTooltip
											cursor={false}
											content={<ChartTooltipContent hideLabel />}
										/>
										<Pie
											data={frameworkChart}
											dataKey="value"
											nameKey="label"
											innerRadius={60}
										/>
									</PieChart>
								</ChartContainer>
							)}
						</CardContent>
					</Card>
				</div>

				<Card>
					<CardHeader className="border-b">
						<CardTitle>History</CardTitle>
						<CardDescription>
							Tracks active coding time per workspace folder.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Project</TableHead>
									<TableHead>Date</TableHead>
									<TableHead>Active Time</TableHead>
									<TableHead className="w-12 text-right">Delete</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{pageRows.length === 0 ? (
									<TableRow>
										<TableCell colSpan={4} className="text-muted-foreground">
											No data yet.
										</TableCell>
									</TableRow>
								) : (
									pageRows.map((row) => (
										<TableRow key={`${row.project}-${row.date}`}>
											<TableCell className="font-medium">
												{row.project}
											</TableCell>
											<TableCell className="text-muted-foreground">
												{row.date}
											</TableCell>
											<TableCell>{formatDuration(row.ms)}</TableCell>
											<TableCell className="text-right">
												<Button
													variant="ghost"
													size="icon"
													onClick={() => handleDeleteRow(row)}
													disabled={row.date === todayKey}
													aria-label={`Delete history for ${row.project} on ${row.date}`}
												>
													<Trash2 className="h-4 w-4" />
												</Button>
											</TableCell>
										</TableRow>
									))
								)}
							</TableBody>
						</Table>
						<div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
							<span>
								Page {page} of {totalPages}
							</span>
							<div className="flex gap-2">
								<Button
									variant="outline"
									size="sm"
									onClick={() => setPage((prev) => Math.max(1, prev - 1))}
									disabled={page === 1}
								>
									Previous
								</Button>
								<Button
									variant="outline"
									size="sm"
									onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
									disabled={page === totalPages}
								>
									Next
								</Button>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
