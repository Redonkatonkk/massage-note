// Adapted from shadcn/ui's tasks DataTableToolbar (MIT, Copyright (c) 2023 shadcn).
// Source and full license: docs/engineering/THIRD_PARTY_NOTICES.md.
import type { MemberFilter, MemberRoleFilter } from "../../lib/member-management";

interface MembersToolbarProps {
  query: string;
  filter: MemberFilter;
  role: MemberRoleFilter;
  counts: Record<MemberFilter, number>;
  onQuery: (value: string) => void;
  onFilter: (value: MemberFilter) => void;
  onRole: (value: MemberRoleFilter) => void;
}

const filters: Array<[MemberFilter, string]> = [["ACTIVE", "在职"], ["UNCLAIMED", "等待注册"], ["INACTIVE", "已停用"], ["ALL", "全部成员"]];

export function MembersToolbar({ query, filter, role, counts, onQuery, onFilter, onRole }: MembersToolbarProps) {
  const isFiltered = query !== "" || role !== "ALL" || filter !== "ACTIVE";
  return <div className="members-toolbar">
    <div className="members-filter-tabs" aria-label="成员状态">
      {filters.map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => onFilter(value)}>{label}<span>{counts[value]}</span></button>)}
    </div>
    <div className="members-toolbar__controls">
      <label className="members-search"><span className="members-search__icon" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg></span><input type="search" aria-label="搜索成员姓名或手机号" placeholder="搜索姓名或手机号" value={query} onChange={(event) => onQuery(event.target.value)} /></label>
      <select aria-label="筛选成员角色" value={role} onChange={(event) => onRole(event.target.value as MemberRoleFilter)}><option value="ALL">全部角色</option><option value="OWNER">店主</option><option value="MANAGER">经理</option><option value="EMPLOYEE">员工</option></select>
      {isFiltered && <button className="table-action" type="button" onClick={() => { onQuery(""); onRole("ALL"); onFilter("ACTIVE"); }}>重置筛选</button>}
    </div>
  </div>;
}
