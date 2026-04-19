'use strict';

const now = new Date();

const TEMPLATES = [
  {
    name: 'Minimal',
    description: 'Clean black and grey. Works with any data set.',
    fontFamily: 'Inter',
    colorPalette: JSON.stringify([
      '#111827','#374151','#6b7280','#9ca3af',
      '#d1d5db','#4b5563','#1f2937','#e5e7eb',
    ]),
    accentColor: '#111827',
    isBuiltIn: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    name: 'Corporate Blue',
    description: 'Professional blue tones — great for business reports.',
    fontFamily: 'Inter',
    colorPalette: JSON.stringify([
      '#1e3a8a','#1e40af','#1d4ed8','#2563eb',
      '#3b82f6','#60a5fa','#93c5fd','#bfdbfe',
    ]),
    accentColor: '#1e40af',
    isBuiltIn: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    name: 'Warm Sunset',
    description: 'Amber, orange and red — warm and engaging.',
    fontFamily: 'Merriweather',
    colorPalette: JSON.stringify([
      '#92400e','#b45309','#d97706','#f59e0b',
      '#fbbf24','#c2410c','#ea580c','#f97316',
    ]),
    accentColor: '#b45309',
    isBuiltIn: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    name: 'Forest',
    description: 'Natural green shades — calm and easy on the eyes.',
    fontFamily: 'Lato',
    colorPalette: JSON.stringify([
      '#14532d','#166534','#15803d','#16a34a',
      '#22c55e','#4ade80','#065f46','#10b981',
    ]),
    accentColor: '#15803d',
    isBuiltIn: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    name: 'Purple Haze',
    description: 'Rich purple palette — bold and creative.',
    fontFamily: 'Roboto',
    colorPalette: JSON.stringify([
      '#4c1d95','#5b21b6','#6d28d9','#7c3aed',
      '#8b5cf6','#a78bfa','#3b0764','#c4b5fd',
    ]),
    accentColor: '#6d28d9',
    isBuiltIn: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    name: 'Ocean Teal',
    description: 'Teal and cyan — fresh and modern.',
    fontFamily: 'Inter',
    colorPalette: JSON.stringify([
      '#164e63','#155e75','#0e7490','#0891b2',
      '#06b6d4','#22d3ee','#67e8f9','#a5f3fc',
    ]),
    accentColor: '#0891b2',
    isBuiltIn: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    name: 'Rose Gold',
    description: 'Soft rose and pink — elegant and refined.',
    fontFamily: 'Lato',
    colorPalette: JSON.stringify([
      '#881337','#9f1239','#be123c','#e11d48',
      '#f43f5e','#fb7185','#fda4af','#fecdd3',
    ]),
    accentColor: '#be123c',
    isBuiltIn: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    name: 'Slate Dark',
    description: 'Dark slate tones — sophisticated data storytelling.',
    fontFamily: 'Roboto',
    colorPalette: JSON.stringify([
      '#0f172a','#1e293b','#334155','#475569',
      '#64748b','#94a3b8','#cbd5e1','#e2e8f0',
    ]),
    accentColor: '#334155',
    isBuiltIn: true,
    createdAt: now,
    updatedAt: now,
  },
];

module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkInsert('dashboard_templates', TEMPLATES);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('dashboard_templates', { isBuiltIn: true });
  },
};
