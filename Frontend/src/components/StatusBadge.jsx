import React from 'react';

/**
 * Standardized status badge component for consistent display and styling
 * across all dashboard and task tab views.
 */
export const StatusBadge = ({ status = 'Request', children, className = '', style }) => {
  const displayStatus = status || 'Request';
  const slug = displayStatus.toLowerCase().replace(/\s+/g, '-');
  return (
    <span className={`status-badge ${slug} ${className}`.trim()} style={style}>
      {children || displayStatus}
    </span>
  );
};

export default StatusBadge;

