// Pre-loaded offline routes for 100% zero-data motorcycle navigation
export const PRELOADED_ROUTES = [
  {
    id: 'kathmandu-valley',
    title: 'Kathmandu Heritage Loop',
    description: 'Thamel to Patan Durbar Square via Ring Road',
    destination: 'Patan Durbar Square',
    waypoints: [
      { lat: 27.7155, lon: 85.3123, turn: 'L', name: 'Turn left onto Tridevi Marg' },
      { lat: 27.7120, lon: 85.3135, turn: 'R', name: 'Turn right toward Kantipath' },
      { lat: 27.7005, lon: 85.3150, turn: 'L', name: 'Turn left onto Tripureshwor' },
      { lat: 27.6912, lon: 85.3188, turn: 'R', name: 'Turn right over Bagmati Bridge' },
      { lat: 27.6744, lon: 85.3260, turn: 'L', name: 'Turn left onto Mangal Bazaar' },
      { lat: 27.6727, lon: 85.3255, turn: 'U', name: 'Make U-Turn at Patan Square Entrance' }
    ]
  },
  {
    id: 'mountain-pass',
    title: 'Nagarkot Mountain Ridge Run',
    description: 'Bhaktapur to Nagarkot Viewpoint climb',
    destination: 'Nagarkot Tower',
    waypoints: [
      { lat: 27.6710, lon: 85.4290, turn: 'L', name: 'Turn left onto Nagarkot Road' },
      { lat: 27.6850, lon: 85.4520, turn: 'R', name: 'Turn right at Telkot hairpin' },
      { lat: 27.7020, lon: 85.4950, turn: 'L', name: 'Turn left toward Baluwapatti curve' },
      { lat: 27.7170, lon: 85.5200, turn: 'R', name: 'Sharp right onto Ridge road' },
      { lat: 27.7190, lon: 85.5230, turn: 'U', name: 'U-Turn at Viewpoint summit' }
    ]
  },
  {
    id: 'urban-circuit',
    title: 'City Center Test Circuit',
    description: 'Compact 4-turn verification circuit for bench testing',
    destination: 'Central Station Terminal',
    waypoints: [
      { lat: 27.7050, lon: 85.3200, turn: 'L', name: 'Turn left onto Avenue A' },
      { lat: 27.7090, lon: 85.3230, turn: 'R', name: 'Turn right onto Northway' },
      { lat: 27.7130, lon: 85.3280, turn: 'U', name: 'U-turn at Roundabout' },
      { lat: 27.7100, lon: 85.3250, turn: 'R', name: 'Turn right into Terminal bay' }
    ]
  }
];
