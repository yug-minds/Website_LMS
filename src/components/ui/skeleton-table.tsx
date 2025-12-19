import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./table";

interface SkeletonTableProps {
  columns?: number;
  rows?: number;
}

export function SkeletonTable({ columns = 5, rows = 5 }: SkeletonTableProps) {
  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            {Array.from({ length: columns }).map((_, i) => (
              <TableHead key={i}>
                <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rows }).map((_, i) => (
            <TableRow key={i}>
              {Array.from({ length: columns }).map((_, j) => (
                <TableCell key={j}>
                  <div className="h-4 w-full bg-gray-200 rounded animate-pulse" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}


