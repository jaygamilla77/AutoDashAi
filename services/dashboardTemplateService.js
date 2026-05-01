'use strict';

/**
 * Dashboard Template Service
 * Provides pre-built dashboard templates with metadata for the guided wizard
 */

/**
 * Get all available dashboard templates
 * Templates include recommended KPIs, chart types, and color themes
 */
function getAllTemplates() {
  return [
    {
      id: 'executive-dashboard',
      name: 'Executive Dashboard',
      description: 'High-level business metrics and KPIs for C-suite executives',
      category: 'executive',
      icon: 'bi-bar-chart-fill',
      recommendedKpis: ['Total Revenue', 'Growth Rate', 'Profit Margin', 'Customer Count'],
      suggestedCharts: ['KPI Cards', 'Line Chart (Trends)', 'Bar Chart (Comparison)', 'Pie Chart (Distribution)'],
      colorOptions: ['corporate', 'blue', 'green', 'neutral'],
      layout: 'executive',
      defaultColors: { primary: '#0EA5E9', secondary: '#6366F1', accent: '#8B5CF6' }
    },
    {
      id: 'hr-dashboard',
      name: 'HR Dashboard',
      description: 'Employee metrics, hiring, performance, and attrition analysis',
      category: 'hr',
      icon: 'bi-people-fill',
      recommendedKpis: ['Headcount', 'Turnover Rate', 'Avg Salary', 'Open Positions'],
      suggestedCharts: ['KPI Cards', 'Headcount by Department', 'Attrition Trend', 'Salary Range Distribution'],
      colorOptions: ['corporate', 'blue', 'green', 'purple'],
      layout: 'analytical',
      defaultColors: { primary: '#10B981', secondary: '#34D399', accent: '#6EE7B7' }
    },
    {
      id: 'sales-dashboard',
      name: 'Sales Dashboard',
      description: 'Revenue, pipeline, conversion, and sales performance metrics',
      category: 'sales',
      icon: 'bi-graph-up',
      recommendedKpis: ['Total Revenue', 'Deal Count', 'Conversion Rate', 'Pipeline Value'],
      suggestedCharts: ['Revenue by Region', 'Sales Pipeline', 'Deal Size Distribution', 'Forecast vs Actual'],
      colorOptions: ['corporate', 'blue', 'green', 'orange'],
      layout: 'analytical',
      defaultColors: { primary: '#F59E0B', secondary: '#FBBF24', accent: '#FCD34D' }
    },
    {
      id: 'finance-dashboard',
      name: 'Finance Dashboard',
      description: 'Budget, expenses, cash flow, and financial performance',
      category: 'finance',
      icon: 'bi-calculator-fill',
      recommendedKpis: ['Total Budget', 'Spending Rate', 'Cash Flow', 'ROI'],
      suggestedCharts: ['Budget vs Actual', 'Expense by Category', 'Cash Flow Trend', 'Department Spending'],
      colorOptions: ['corporate', 'blue', 'green', 'neutral'],
      layout: 'analytical',
      defaultColors: { primary: '#3B82F6', secondary: '#60A5FA', accent: '#93C5FD' }
    },
    {
      id: 'operations-dashboard',
      name: 'Operations Dashboard',
      description: 'Process efficiency, resource utilization, and operational metrics',
      category: 'operations',
      icon: 'bi-diagram-3',
      recommendedKpis: ['Efficiency Rate', 'Resource Utilization', 'Incident Count', 'Uptime %'],
      suggestedCharts: ['Efficiency Trend', 'Resource Usage', 'Incident by Type', 'Process Performance'],
      colorOptions: ['corporate', 'blue', 'purple', 'neutral'],
      layout: 'analytical',
      defaultColors: { primary: '#8B5CF6', secondary: '#A78BFA', accent: '#C4B5FD' }
    },
    {
      id: 'customer-service-dashboard',
      name: 'Customer Service Dashboard',
      description: 'Support tickets, customer satisfaction, and service metrics',
      category: 'customer-service',
      icon: 'bi-headset',
      recommendedKpis: ['Open Tickets', 'Avg Resolution Time', 'CSAT Score', 'First Contact Resolution'],
      suggestedCharts: ['Tickets by Status', 'Resolution Time Trend', 'CSAT by Category', 'Agent Performance'],
      colorOptions: ['corporate', 'blue', 'green', 'teal'],
      layout: 'analytical',
      defaultColors: { primary: '#06B6D4', secondary: '#22D3EE', accent: '#67E8F9' }
    },
    {
      id: 'it-service-management',
      name: 'IT Service Management',
      description: 'System performance, incident management, and IT metrics',
      category: 'it',
      icon: 'bi-cpu',
      recommendedKpis: ['System Uptime', 'Incident Count', 'Avg Resolution Time', 'Change Success Rate'],
      suggestedCharts: ['System Status', 'Incident Trend', 'Resolution Time Distribution', 'Change Impact'],
      colorOptions: ['corporate', 'blue', 'gray', 'neutral'],
      layout: 'analytical',
      defaultColors: { primary: '#6B7280', secondary: '#9CA3AF', accent: '#D1D5DB' }
    },
    {
      id: 'project-management-dashboard',
      name: 'Project Management Dashboard',
      description: 'Project progress, resource allocation, and delivery metrics',
      category: 'project',
      icon: 'bi-kanban',
      recommendedKpis: ['Active Projects', 'On-time Delivery %', 'Budget Utilization', 'Resource Load'],
      suggestedCharts: ['Project Timeline', 'Budget vs Actual', 'Resource Utilization', 'Task Completion %'],
      colorOptions: ['corporate', 'blue', 'green', 'purple'],
      layout: 'analytical',
      defaultColors: { primary: '#6366F1', secondary: '#818CF8', accent: '#A5B4FC' }
    },
    {
      id: 'recruitment-dashboard',
      name: 'Recruitment Dashboard',
      description: 'Job postings, applicants, hiring pipeline, and recruitment metrics',
      category: 'recruitment',
      icon: 'bi-person-plus',
      recommendedKpis: ['Open Positions', 'Applications Received', 'Offer Acceptance %', 'Time to Hire'],
      suggestedCharts: ['Applications by Position', 'Conversion Funnel', 'Time to Hire Trend', 'Source Effectiveness'],
      colorOptions: ['corporate', 'blue', 'green', 'purple'],
      layout: 'analytical',
      defaultColors: { primary: '#EC4899', secondary: '#F472B6', accent: '#FBCFE8' }
    },
    {
      id: 'inventory-dashboard',
      name: 'Inventory Dashboard',
      description: 'Stock levels, product performance, and inventory management',
      category: 'inventory',
      icon: 'bi-boxes',
      recommendedKpis: ['Total Inventory Value', 'Stock Turnover Rate', 'Out of Stock Items', 'Inventory Accuracy'],
      suggestedCharts: ['Inventory by Category', 'Stock Movement', 'Slow Moving Items', 'Warehouse Utilization'],
      colorOptions: ['corporate', 'blue', 'orange', 'brown'],
      layout: 'analytical',
      defaultColors: { primary: '#DC2626', secondary: '#F87171', accent: '#FCA5A5' }
    },
    {
      id: 'custom-ai-dashboard',
      name: 'Custom AI-Generated Dashboard',
      description: 'Let AI analyze your data and build a custom dashboard automatically',
      category: 'custom',
      icon: 'bi-stars',
      recommendedKpis: [],
      suggestedCharts: [],
      colorOptions: ['corporate', 'blue', 'green', 'neutral', 'purple'],
      layout: 'ai-generated',
      defaultColors: { primary: '#6366F1', secondary: '#8B5CF6', accent: '#D946EF' }
    }
  ];
}

/**
 * Get template by ID
 */
function getTemplate(templateId) {
  const templates = getAllTemplates();
  return templates.find(t => t.id === templateId);
}

/**
 * Get color theme options
 */
function getColorThemes() {
  return [
    {
      id: 'corporate',
      name: 'Corporate',
      description: 'Professional blue and gray tones',
      colors: {
        primary: '#0EA5E9',
        secondary: '#64748B',
        accent: '#6366F1',
        background: '#F8FAFC',
        text: '#0F172A'
      }
    },
    {
      id: 'blue',
      name: 'Blue',
      description: 'Clean sky blue and navy',
      colors: {
        primary: '#3B82F6',
        secondary: '#1E40AF',
        accent: '#60A5FA',
        background: '#F0F9FF',
        text: '#001F3F'
      }
    },
    {
      id: 'green',
      name: 'Green',
      description: 'Fresh green and teal',
      colors: {
        primary: '#10B981',
        secondary: '#065F46',
        accent: '#34D399',
        background: '#F0FDF4',
        text: '#064E3B'
      }
    },
    {
      id: 'purple',
      name: 'Purple',
      description: 'Modern purple and violet',
      colors: {
        primary: '#A855F7',
        secondary: '#6D28D9',
        accent: '#D8B4FE',
        background: '#FAF5FF',
        text: '#4C1D95'
      }
    },
    {
      id: 'orange',
      name: 'Orange',
      description: 'Warm orange and amber',
      colors: {
        primary: '#F59E0B',
        secondary: '#D97706',
        accent: '#FBBF24',
        background: '#FFFBEB',
        text: '#78350F'
      }
    },
    {
      id: 'neutral',
      name: 'Minimalist',
      description: 'Light and minimal grayscale',
      colors: {
        primary: '#6B7280',
        secondary: '#374151',
        accent: '#9CA3AF',
        background: '#FFFFFF',
        text: '#111827'
      }
    }
  ];
}

/**
 * Get layout options
 */
function getLayoutOptions() {
  return [
    {
      id: 'executive',
      name: '1-Page Executive',
      description: 'Single page with KPIs and key charts',
      gridCols: 12,
      recommended: true
    },
    {
      id: 'analytical',
      name: 'Multi-Page Analytical',
      description: 'Detailed analysis with multiple pages',
      gridCols: 12,
      recommended: false
    },
    {
      id: 'ai-generated',
      name: 'AI-Optimized Layout',
      description: 'AI determines best layout for your data',
      gridCols: 12,
      recommended: true
    }
  ];
}

module.exports = {
  getAllTemplates,
  getTemplate,
  getColorThemes,
  getLayoutOptions,
};
