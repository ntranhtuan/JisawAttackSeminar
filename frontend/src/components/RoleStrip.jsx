/** Một dòng tóm tắt vai trò: tên + những gì vai trò này có / không có. */
export default function RoleStrip({ role, title, has, hasNot, children }) {
  return (
    <div className={`role-strip ${role}`}>
      <span className={`role-name ${role}`}>{title}</span>
      <span className="role-group">
        {has.map((h) => (
          <span key={h} className="rchip yes">
            ✓ {h}
          </span>
        ))}
      </span>
      <span className="role-group">
        {hasNot.map((h) => (
          <span key={h} className="rchip no">
            ✗ {h}
          </span>
        ))}
      </span>
      {children && <span className="role-extra">{children}</span>}
    </div>
  );
}
