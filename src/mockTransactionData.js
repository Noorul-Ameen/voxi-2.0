// Demo-only transaction fixtures stay separate from the showtime snapshot so
// the production entry bundle does not include every cinema session.
export function seatPlan(seed = 7) {
  let n = seed || 1;
  const rnd = () => {
    n = (n * 9301 + 49297) % 233280;
    return n / 233280;
  };
  const rows = "ABCDEFGH".split("").map((name, rowIndex) => ({
    RowIndexZeroBased: rowIndex,
    PhysicalName: name,
    Seats: Array.from({ length: 12 }, (_, columnIndex) => ({
      Position: { AreaNumber: 1, RowIndex: rowIndex, ColumnIndex: columnIndex },
      Id: String(columnIndex + 1),
      Status: rnd() < 0.22 ? 1 : 0,
      SeatStyle: 0,
      areaCategoryCode: rowIndex >= 5 ? "0000000001" : "0000000002",
    })),
  }));
  return {
    SeatLayoutData: {
      Areas: [{ AreaCategoryCode: "0000000002", Description: "REGULAR", Rows: rows, RowCount: 8, ColumnCount: 12 }],
      AreaCategories: [
        { AreaCategoryCode: "0000000002", Name: "REGULAR" },
        { AreaCategoryCode: "0000000001", Name: "PREMIUM" },
      ],
    },
    ResponseCode: 0,
    ErrorDescription: null,
  };
}

export const BOOKING = Object.freeze({
  BookingId: "WL59LFJ",
  BookingNumber: 8608,
  FilmTitle: "Alpha",
  Showtime: "2026-07-16T18:40:00",
  Seats: Object.freeze(["C5", "C6"]),
  TotalValueCents: 12600,
  ScreenName: "MAX",
});
