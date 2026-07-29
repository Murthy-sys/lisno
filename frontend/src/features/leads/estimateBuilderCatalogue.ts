export const estimateBuilderSections = [
  {
    "id": "FC",
    "label": "False Ceiling",
    "icon": "🏛",
    "color": "#6366F1",
    "rows": [
      {
        "id": "FC01",
        "description": "False ceiling — main area",
        "unit": "sqft",
        "baseRate": 0,
        "rates": {
          "plain_gyp": 95,
          "cov_gyp": 125,
          "pop": 110,
          "cal_sil": 130,
          "coffered": 195
        },
        "defaultRate": "plain_gyp",
        "specifications": [
          "Gypsum plain",
          "Gypsum with cove",
          "POP plain",
          "Calcium silicate",
          "Designer/Coffered"
        ],
        "quantityBasis": "area",
        "luxuryUpgrade": null,
        "bucketsBySpecification": {
          "Gypsum plain": [
            {
              "b": "false_ceiling",
              "pct": 100
            }
          ],
          "Gypsum with cove": [
            {
              "b": "false_ceiling",
              "pct": 65
            },
            {
              "b": "pop_works",
              "pct": 35
            }
          ],
          "POP plain": [
            {
              "b": "pop_works",
              "pct": 100
            }
          ],
          "Calcium silicate": [
            {
              "b": "false_ceiling",
              "pct": 100
            }
          ],
          "Designer/Coffered": [
            {
              "b": "false_ceiling",
              "pct": 70
            },
            {
              "b": "pop_works",
              "pct": 30
            }
          ]
        }
      },
      {
        "id": "FC02",
        "description": "Cove / pelmet boxing",
        "unit": "rft",
        "baseRate": 120,
        "rates": null,
        "defaultRate": null,
        "specifications": [
          "POP cove 4\"",
          "Gypsum pelmet box",
          "POP cornice 6\""
        ],
        "quantityBasis": "perimeter",
        "luxuryUpgrade": null,
        "bucketsBySpecification": {
          "POP cove 4\"": [
            {
              "b": "pop_works",
              "pct": 100
            }
          ],
          "Gypsum pelmet box": [
            {
              "b": "pop_works",
              "pct": 100
            }
          ],
          "POP cornice 6\"": [
            {
              "b": "pop_works",
              "pct": 100
            }
          ]
        }
      },
      {
        "id": "FC03",
        "description": "Faux beam / design element",
        "unit": "rft",
        "baseRate": 180,
        "rates": null,
        "defaultRate": null,
        "specifications": [
          "MDF wrapped beam",
          "POP beam",
          "Wooden beam look"
        ],
        "quantityBasis": "custom",
        "luxuryUpgrade": null,
        "bucketsBySpecification": {
          "MDF wrapped beam": [
            {
              "b": "false_ceiling",
              "pct": 40
            },
            {
              "b": "custom_carp",
              "pct": 60
            }
          ],
          "POP beam": [
            {
              "b": "false_ceiling",
              "pct": 40
            },
            {
              "b": "custom_carp",
              "pct": 60
            }
          ],
          "Wooden beam look": [
            {
              "b": "false_ceiling",
              "pct": 40
            },
            {
              "b": "custom_carp",
              "pct": 60
            }
          ]
        }
      }
    ]
  },
  {
    "id": "FL",
    "label": "Flooring",
    "icon": "🪨",
    "color": "#D97706",
    "rows": [
      {
        "id": "FL01",
        "description": "Floor finish",
        "unit": "sqft",
        "baseRate": 0,
        "rates": {
          "Vitrified tiles 800×800": 180,
          "Vitrified tiles 600×600": 155,
          "Engineered wood": 320,
          "Italian marble": 650,
          "Indian marble": 220,
          "IPS/Epoxy floor": 95
        },
        "defaultRate": "Vitrified tiles 800×800",
        "specifications": [
          "Vitrified tiles 800×800",
          "Vitrified tiles 600×600",
          "Engineered wood",
          "Italian marble",
          "Indian marble",
          "IPS/Epoxy floor"
        ],
        "quantityBasis": "area",
        "luxuryUpgrade": {
          "desc": "Italian marble / herringbone engineered wood",
          "extraRate": 300,
          "spec": "Upgrade to premium marble or pattern-laid wood"
        },
        "bucketsBySpecification": {
          "Vitrified tiles 800×800": [
            {
              "b": "flooring",
              "pct": 100
            }
          ],
          "Vitrified tiles 600×600": [
            {
              "b": "flooring",
              "pct": 100
            }
          ],
          "Engineered wood": [
            {
              "b": "flooring",
              "pct": 100
            }
          ],
          "Italian marble": [
            {
              "b": "flooring",
              "pct": 100
            }
          ],
          "Indian marble": [
            {
              "b": "flooring",
              "pct": 100
            }
          ],
          "IPS/Epoxy floor": [
            {
              "b": "flooring",
              "pct": 100
            }
          ]
        }
      },
      {
        "id": "FL02",
        "description": "Skirting",
        "unit": "rft",
        "baseRate": 75,
        "rates": null,
        "defaultRate": null,
        "specifications": [
          "Matching tile skirting 4\"",
          "Marble skirting 3\"",
          "Wooden skirting"
        ],
        "quantityBasis": "perimeter",
        "luxuryUpgrade": null,
        "bucketsBySpecification": {
          "Matching tile skirting 4\"": [
            {
              "b": "flooring",
              "pct": 100
            }
          ],
          "Marble skirting 3\"": [
            {
              "b": "flooring",
              "pct": 100
            }
          ],
          "Wooden skirting": [
            {
              "b": "flooring",
              "pct": 100
            }
          ]
        }
      },
      {
        "id": "FL03",
        "description": "Wall dado / bathroom wall tile",
        "unit": "sqft",
        "baseRate": 85,
        "rates": null,
        "defaultRate": null,
        "specifications": [
          "300×600 wall tile full height",
          "300×600 half height",
          "300×300 mosaic"
        ],
        "quantityBasis": "custom",
        "luxuryUpgrade": null,
        "bucketsBySpecification": {
          "300×600 wall tile full height": [
            {
              "b": "flooring",
              "pct": 100
            }
          ],
          "300×600 half height": [
            {
              "b": "flooring",
              "pct": 100
            }
          ],
          "300×300 mosaic": [
            {
              "b": "flooring",
              "pct": 100
            }
          ]
        }
      }
    ]
  },
  {
    "id": "CA",
    "label": "Carpentry",
    "icon": "🪵",
    "color": "#A16207",
    "rows": [
      {
        "id": "CA01",
        "description": "TV unit",
        "unit": "lot",
        "baseRate": 32000,
        "rates": null,
        "defaultRate": null,
        "specifications": [
          "BWR ply + lacquer paint",
          "BWR ply + veneer + polish",
          "BWR ply + membrane",
          "MDF + PU paint"
        ],
        "quantityBasis": "1",
        "luxuryUpgrade": {
          "desc": "Backlit panel + floating units",
          "extraRate": 12000,
          "spec": "LED backlit panel + floating open shelves"
        },
        "bucketsBySpecification": {
          "BWR ply + lacquer paint": [
            {
              "b": "custom_carp",
              "pct": 75
            },
            {
              "b": "polish",
              "pct": 25
            }
          ],
          "BWR ply + veneer + polish": [
            {
              "b": "custom_carp",
              "pct": 75
            },
            {
              "b": "polish",
              "pct": 25
            }
          ],
          "BWR ply + membrane": [
            {
              "b": "custom_carp",
              "pct": 75
            },
            {
              "b": "polish",
              "pct": 25
            }
          ],
          "MDF + PU paint": [
            {
              "b": "custom_carp",
              "pct": 75
            },
            {
              "b": "polish",
              "pct": 25
            }
          ]
        }
      },
      {
        "id": "CA02",
        "description": "Wardrobe",
        "unit": "lot",
        "baseRate": 52000,
        "rates": null,
        "defaultRate": null,
        "specifications": [
          "Swing door — membrane",
          "Swing door — veneer",
          "Sliding door — glass+aluminium",
          "Swing — PU paint"
        ],
        "quantityBasis": "1",
        "luxuryUpgrade": {
          "desc": "Glass shutter + profile cane shutter",
          "extraRate": 14000,
          "spec": "Glass panel / woven cane profile door"
        },
        "bucketsBySpecification": {
          "Swing door — membrane": [
            {
              "b": "modular",
              "pct": 100
            }
          ],
          "Swing door — veneer": [
            {
              "b": "modular",
              "pct": 100
            }
          ],
          "Sliding door — glass+aluminium": [
            {
              "b": "modular",
              "pct": 85
            },
            {
              "b": "ms_metal",
              "pct": 15
            }
          ],
          "Swing — PU paint": [
            {
              "b": "modular",
              "pct": 100
            }
          ]
        }
      },
      {
        "id": "CA03",
        "description": "Storage / loft",
        "unit": "lot",
        "baseRate": 14000,
        "rates": null,
        "defaultRate": null,
        "specifications": [
          "Overhead loft with shutter",
          "Open shelving unit",
          "Storage ottaman"
        ],
        "quantityBasis": "1",
        "luxuryUpgrade": null,
        "bucketsBySpecification": {
          "Overhead loft with shutter": [
            {
              "b": "modular",
              "pct": 100
            }
          ],
          "Open shelving unit": [
            {
              "b": "modular",
              "pct": 100
            }
          ],
          "Storage ottaman": [
            {
              "b": "modular",
              "pct": 100
            }
          ]
        }
      },
      {
        "id": "CA04",
        "description": "Wall paneling",
        "unit": "sqft",
        "baseRate": 320,
        "rates": null,
        "defaultRate": null,
        "specifications": [
          "Veneer + polish",
          "Laminate flush panel",
          "Batten/slat wall (MDF)",
          "PU paint panel"
        ],
        "quantityBasis": "custom",
        "luxuryUpgrade": null,
        "bucketsBySpecification": {
          "Veneer + polish": [
            {
              "b": "custom_carp",
              "pct": 55
            },
            {
              "b": "polish",
              "pct": 30
            },
            {
              "b": "ms_metal",
              "pct": 15
            }
          ],
          "Laminate flush panel": [
            {
              "b": "custom_carp",
              "pct": 80
            },
            {
              "b": "polish",
              "pct": 20
            }
          ],
          "Batten/slat wall (MDF)": [
            {
              "b": "custom_carp",
              "pct": 80
            },
            {
              "b": "polish",
              "pct": 20
            }
          ],
          "PU paint panel": [
            {
              "b": "custom_carp",
              "pct": 80
            },
            {
              "b": "polish",
              "pct": 20
            }
          ]
        }
      },
      {
        "id": "CA05",
        "description": "Bed with storage",
        "unit": "lot",
        "baseRate": 42000,
        "rates": null,
        "defaultRate": null,
        "specifications": [
          "Hydraulic storage — upholstered headboard",
          "Drawer pull-outs — PU paint HB",
          "Platform bed — no storage"
        ],
        "quantityBasis": "1",
        "luxuryUpgrade": null,
        "bucketsBySpecification": {
          "Hydraulic storage — upholstered headboard": [
            {
              "b": "custom_carp",
              "pct": 80
            },
            {
              "b": "polish",
              "pct": 20
            }
          ],
          "Drawer pull-outs — PU paint HB": [
            {
              "b": "custom_carp",
              "pct": 80
            },
            {
              "b": "polish",
              "pct": 20
            }
          ],
          "Platform bed — no storage": [
            {
              "b": "custom_carp",
              "pct": 80
            },
            {
              "b": "polish",
              "pct": 20
            }
          ]
        }
      },
      {
        "id": "CA06",
        "description": "Study / bookcase unit",
        "unit": "lot",
        "baseRate": 38000,
        "rates": null,
        "defaultRate": null,
        "specifications": [
          "Lacquer paint finish",
          "Veneer + polish",
          "Laminate finish"
        ],
        "quantityBasis": "1",
        "luxuryUpgrade": null,
        "bucketsBySpecification": {
          "Lacquer paint finish": [
            {
              "b": "custom_carp",
              "pct": 80
            },
            {
              "b": "polish",
              "pct": 20
            }
          ],
          "Veneer + polish": [
            {
              "b": "custom_carp",
              "pct": 80
            },
            {
              "b": "polish",
              "pct": 20
            }
          ],
          "Laminate finish": [
            {
              "b": "custom_carp",
              "pct": 80
            },
            {
              "b": "polish",
              "pct": 20
            }
          ]
        }
      },
      {
        "id": "CA07",
        "description": "Dresser / vanity",
        "unit": "lot",
        "baseRate": 22000,
        "rates": null,
        "defaultRate": null,
        "specifications": [
          "PU paint + backlit mirror",
          "Membrane + plain mirror",
          "Veneer + LED mirror"
        ],
        "quantityBasis": "1",
        "luxuryUpgrade": null,
        "bucketsBySpecification": {
          "PU paint + backlit mirror": [
            {
              "b": "custom_carp",
              "pct": 75
            },
            {
              "b": "polish",
              "pct": 25
            }
          ],
          "Membrane + plain mirror": [
            {
              "b": "custom_carp",
              "pct": 75
            },
            {
              "b": "polish",
              "pct": 25
            }
          ],
          "Veneer + LED mirror": [
            {
              "b": "custom_carp",
              "pct": 75
            },
            {
              "b": "polish",
              "pct": 25
            }
          ]
        }
      },
      {
        "id": "CA08",
        "description": "Shoe rack / console",
        "unit": "lot",
        "baseRate": 18000,
        "rates": null,
        "defaultRate": null,
        "specifications": [
          "Laminate + seating",
          "PU paint + seating",
          "Open rack no seating"
        ],
        "quantityBasis": "1",
        "luxuryUpgrade": null,
        "bucketsBySpecification": {
          "Laminate + seating": [
            {
              "b": "custom_carp",
              "pct": 80
            },
            {
              "b": "polish",
              "pct": 20
            }
          ],
          "PU paint + seating": [
            {
              "b": "custom_carp",
              "pct": 80
            },
            {
              "b": "polish",
              "pct": 20
            }
          ],
          "Open rack no seating": [
            {
              "b": "custom_carp",
              "pct": 80
            },
            {
              "b": "polish",
              "pct": 20
            }
          ]
        }
      },
      {
        "id": "CA09",
        "description": "Modular kitchen",
        "unit": "lot",
        "baseRate": 145000,
        "rates": null,
        "defaultRate": null,
        "specifications": [
          "Membrane + granite top",
          "PU paint + quartz top",
          "Acrylic + quartz",
          "Veneer + marble top"
        ],
        "quantityBasis": "1",
        "luxuryUpgrade": null,
        "bucketsBySpecification": {
          "Membrane + granite top": [
            {
              "b": "modular",
              "pct": 100
            }
          ],
          "PU paint + quartz top": [
            {
              "b": "modular",
              "pct": 100
            }
          ],
          "Acrylic + quartz": [
            {
              "b": "modular",
              "pct": 100
            }
          ],
          "Veneer + marble top": [
            {
              "b": "modular",
              "pct": 100
            }
          ]
        }
      },
      {
        "id": "CA10",
        "description": "Kitchen island / breakfast bar",
        "unit": "lot",
        "baseRate": 38000,
        "rates": null,
        "defaultRate": null,
        "specifications": [
          "Matching kitchen finish",
          "Contrasting finish",
          "Waterfall edge top"
        ],
        "quantityBasis": "1",
        "luxuryUpgrade": null,
        "bucketsBySpecification": {
          "Matching kitchen finish": [
            {
              "b": "modular",
              "pct": 100
            }
          ],
          "Contrasting finish": [
            {
              "b": "modular",
              "pct": 100
            }
          ],
          "Waterfall edge top": [
            {
              "b": "modular",
              "pct": 100
            }
          ]
        }
      },
      {
        "id": "CA11",
        "description": "Crockery / display unit",
        "unit": "lot",
        "baseRate": 28000,
        "rates": null,
        "defaultRate": null,
        "specifications": [
          "Lacquer + clear glass",
          "Veneer + frosted glass",
          "PU paint + glass"
        ],
        "quantityBasis": "1",
        "luxuryUpgrade": null,
        "bucketsBySpecification": {
          "Lacquer + clear glass": [
            {
              "b": "custom_carp",
              "pct": 70
            },
            {
              "b": "glass",
              "pct": 15
            },
            {
              "b": "polish",
              "pct": 15
            }
          ],
          "Veneer + frosted glass": [
            {
              "b": "custom_carp",
              "pct": 70
            },
            {
              "b": "glass",
              "pct": 15
            },
            {
              "b": "polish",
              "pct": 15
            }
          ],
          "PU paint + glass": [
            {
              "b": "custom_carp",
              "pct": 70
            },
            {
              "b": "glass",
              "pct": 15
            },
            {
              "b": "polish",
              "pct": 15
            }
          ]
        }
      },
      {
        "id": "CA12",
        "description": "Pooja unit",
        "unit": "lot",
        "baseRate": 28000,
        "rates": null,
        "defaultRate": null,
        "specifications": [
          "PU white + backlit jali",
          "Veneer + gold beading",
          "Marble top + lacquer"
        ],
        "quantityBasis": "1",
        "luxuryUpgrade": null,
        "bucketsBySpecification": {
          "PU white + backlit jali": [
            {
              "b": "custom_carp",
              "pct": 70
            },
            {
              "b": "glass",
              "pct": 15
            },
            {
              "b": "polish",
              "pct": 15
            }
          ],
          "Veneer + gold beading": [
            {
              "b": "custom_carp",
              "pct": 70
            },
            {
              "b": "glass",
              "pct": 15
            },
            {
              "b": "polish",
              "pct": 15
            }
          ],
          "Marble top + lacquer": [
            {
              "b": "custom_carp",
              "pct": 70
            },
            {
              "b": "glass",
              "pct": 15
            },
            {
              "b": "polish",
              "pct": 15
            }
          ]
        }
      }
    ]
  },
  {
    "id": "PA",
    "label": "Painting",
    "icon": "🎨",
    "color": "#EC4899",
    "rows": [
      {
        "id": "PA01",
        "description": "Wall & ceiling paint",
        "unit": "sqft",
        "baseRate": 22,
        "rates": {
          "2-coat Tractor/Royale": 22,
          "3-coat premium": 30,
          "Berger Silk": 28,
          "Dulux Velvet": 28
        },
        "defaultRate": "2-coat Tractor/Royale",
        "specifications": [
          "2-coat Tractor/Royale",
          "3-coat premium",
          "Berger Silk",
          "Dulux Velvet"
        ],
        "quantityBasis": "area_x2",
        "luxuryUpgrade": null,
        "bucketsBySpecification": {
          "2-coat Tractor/Royale": [
            {
              "b": "paint",
              "pct": 100
            }
          ],
          "3-coat premium": [
            {
              "b": "paint",
              "pct": 100
            }
          ],
          "Berger Silk": [
            {
              "b": "paint",
              "pct": 100
            }
          ],
          "Dulux Velvet": [
            {
              "b": "paint",
              "pct": 100
            }
          ]
        }
      },
      {
        "id": "PA02",
        "description": "Texture / feature wall",
        "unit": "sqft",
        "baseRate": 65,
        "rates": null,
        "defaultRate": null,
        "specifications": [
          "Sand texture",
          "Stucco Italian",
          "Linen texture",
          "Venetian plaster",
          "Sponge effect"
        ],
        "quantityBasis": "custom",
        "luxuryUpgrade": null,
        "bucketsBySpecification": {
          "Sand texture": [
            {
              "b": "paint",
              "pct": 100
            }
          ],
          "Stucco Italian": [
            {
              "b": "paint",
              "pct": 100
            }
          ],
          "Linen texture": [
            {
              "b": "paint",
              "pct": 100
            }
          ],
          "Venetian plaster": [
            {
              "b": "paint",
              "pct": 100
            }
          ],
          "Sponge effect": [
            {
              "b": "paint",
              "pct": 100
            }
          ]
        }
      },
      {
        "id": "PA03",
        "description": "Wallpaper",
        "unit": "sqft",
        "baseRate": 85,
        "rates": null,
        "defaultRate": null,
        "specifications": [
          "Non-woven wallpaper",
          "Grasscloth natural",
          "Vinyl wallpaper"
        ],
        "quantityBasis": "custom",
        "luxuryUpgrade": null,
        "bucketsBySpecification": {
          "Non-woven wallpaper": [
            {
              "b": "wallpaper",
              "pct": 100
            }
          ],
          "Grasscloth natural": [
            {
              "b": "wallpaper",
              "pct": 100
            }
          ],
          "Vinyl wallpaper": [
            {
              "b": "wallpaper",
              "pct": 100
            }
          ]
        }
      }
    ]
  },
  {
    "id": "EL",
    "label": "Electrical",
    "icon": "⚡",
    "color": "#EAB308",
    "rows": [
      {
        "id": "EL01",
        "description": "Light / fan / switch points",
        "unit": "pts",
        "baseRate": 650,
        "rates": null,
        "defaultRate": null,
        "specifications": [
          "Legrand Arteor",
          "Legrand Myrius",
          "Anchor Roma",
          "GM Modular"
        ],
        "quantityBasis": "custom",
        "luxuryUpgrade": null,
        "bucketsBySpecification": {
          "Legrand Arteor": [
            {
              "b": "electrical",
              "pct": 100
            }
          ],
          "Legrand Myrius": [
            {
              "b": "electrical",
              "pct": 100
            }
          ],
          "Anchor Roma": [
            {
              "b": "electrical",
              "pct": 100
            }
          ],
          "GM Modular": [
            {
              "b": "electrical",
              "pct": 100
            }
          ]
        }
      },
      {
        "id": "EL02",
        "description": "AC points (15A)",
        "unit": "pts",
        "baseRate": 1200,
        "rates": null,
        "defaultRate": null,
        "specifications": [
          "Standard 15A socket",
          "With isolator switch"
        ],
        "quantityBasis": "custom",
        "luxuryUpgrade": null,
        "bucketsBySpecification": {
          "Standard 15A socket": [
            {
              "b": "electrical",
              "pct": 100
            }
          ],
          "With isolator switch": [
            {
              "b": "electrical",
              "pct": 100
            }
          ]
        }
      },
      {
        "id": "EL03",
        "description": "LED strip cove / cove lighting",
        "unit": "rft",
        "baseRate": 180,
        "rates": null,
        "defaultRate": null,
        "specifications": [
          "Warm white 3000K",
          "Cool white 6500K",
          "RGB",
          "Dual white tunable"
        ],
        "quantityBasis": "perimeter",
        "luxuryUpgrade": null,
        "bucketsBySpecification": {
          "Warm white 3000K": [
            {
              "b": "electrical",
              "pct": 100
            }
          ],
          "Cool white 6500K": [
            {
              "b": "electrical",
              "pct": 100
            }
          ],
          "RGB": [
            {
              "b": "electrical",
              "pct": 100
            }
          ],
          "Dual white tunable": [
            {
              "b": "electrical",
              "pct": 100
            }
          ]
        }
      },
      {
        "id": "EL04",
        "description": "Recessed spotlights",
        "unit": "nos",
        "baseRate": 850,
        "rates": null,
        "defaultRate": null,
        "specifications": [
          "GU10 white trim",
          "GU10 chrome",
          "GU10 black",
          "GU10 gold"
        ],
        "quantityBasis": "custom",
        "luxuryUpgrade": null,
        "bucketsBySpecification": {
          "GU10 white trim": [
            {
              "b": "electrical",
              "pct": 100
            }
          ],
          "GU10 chrome": [
            {
              "b": "electrical",
              "pct": 100
            }
          ],
          "GU10 black": [
            {
              "b": "electrical",
              "pct": 100
            }
          ],
          "GU10 gold": [
            {
              "b": "electrical",
              "pct": 100
            }
          ]
        }
      },
      {
        "id": "EL05",
        "description": "Geyser / exhaust point",
        "unit": "pts",
        "baseRate": 1100,
        "rates": null,
        "defaultRate": null,
        "specifications": [
          "15A geyser + exhaust fan provision"
        ],
        "quantityBasis": "1",
        "luxuryUpgrade": null,
        "bucketsBySpecification": {
          "15A geyser + exhaust fan provision": [
            {
              "b": "electrical",
              "pct": 100
            }
          ]
        }
      }
    ]
  },
  {
    "id": "CV",
    "label": "Civil & Plumbing",
    "icon": "🏗",
    "color": "#64748B",
    "rows": [
      {
        "id": "CV01",
        "description": "Waterproofing",
        "unit": "sqft",
        "baseRate": 220,
        "rates": null,
        "defaultRate": null,
        "specifications": [
          "Dr. Fixit 2-coat brush",
          "Kryton integral waterproofing",
          "Roff 3-coat system"
        ],
        "quantityBasis": "area",
        "luxuryUpgrade": null,
        "bucketsBySpecification": {
          "Dr. Fixit 2-coat brush": [
            {
              "b": "civil",
              "pct": 100
            }
          ],
          "Kryton integral waterproofing": [
            {
              "b": "civil",
              "pct": 100
            }
          ],
          "Roff 3-coat system": [
            {
              "b": "civil",
              "pct": 100
            }
          ]
        }
      },
      {
        "id": "CV02",
        "description": "Bathroom plumbing — fittings",
        "unit": "lot",
        "baseRate": 28000,
        "rates": null,
        "defaultRate": null,
        "specifications": [
          "Jaquar — overhead + hand shower",
          "Kohler — rain shower",
          "Grohe — concealed set",
          "Hindware standard set"
        ],
        "quantityBasis": "1",
        "luxuryUpgrade": null,
        "bucketsBySpecification": {
          "Jaquar — overhead + hand shower": [
            {
              "b": "civil",
              "pct": 100
            }
          ],
          "Kohler — rain shower": [
            {
              "b": "civil",
              "pct": 100
            }
          ],
          "Grohe — concealed set": [
            {
              "b": "civil",
              "pct": 100
            }
          ],
          "Hindware standard set": [
            {
              "b": "civil",
              "pct": 100
            }
          ]
        }
      },
      {
        "id": "CV03",
        "description": "EWC / WC",
        "unit": "nos",
        "baseRate": 12000,
        "rates": null,
        "defaultRate": null,
        "specifications": [
          "Wall hung — concealed cistern",
          "Floor mounted — standard",
          "Smart bidet seat"
        ],
        "quantityBasis": "1",
        "luxuryUpgrade": null,
        "bucketsBySpecification": {
          "Wall hung — concealed cistern": [
            {
              "b": "civil",
              "pct": 100
            }
          ],
          "Floor mounted — standard": [
            {
              "b": "civil",
              "pct": 100
            }
          ],
          "Smart bidet seat": [
            {
              "b": "civil",
              "pct": 100
            }
          ]
        }
      },
      {
        "id": "CV04",
        "description": "Kitchen plumbing — sink",
        "unit": "lot",
        "baseRate": 8000,
        "rates": null,
        "defaultRate": null,
        "specifications": [
          "SS double bowl sink",
          "SS single bowl",
          "Granite composite sink"
        ],
        "quantityBasis": "1",
        "luxuryUpgrade": null,
        "bucketsBySpecification": {
          "SS double bowl sink": [
            {
              "b": "civil",
              "pct": 100
            }
          ],
          "SS single bowl": [
            {
              "b": "civil",
              "pct": 100
            }
          ],
          "Granite composite sink": [
            {
              "b": "civil",
              "pct": 100
            }
          ]
        }
      }
    ]
  },
  {
    "id": "LF",
    "label": "Loose Furniture",
    "icon": "🛋",
    "color": "#10B981",
    "rows": [
      {
        "id": "LF01",
        "description": "Sofa",
        "unit": "lot",
        "baseRate": 75000,
        "rates": null,
        "defaultRate": null,
        "specifications": [
          "L-shape 5-seater — cotton",
          "Sectional 6-seater — microfiber",
          "3+2 seater — linen",
          "3+2 — faux leather"
        ],
        "quantityBasis": "1",
        "luxuryUpgrade": null,
        "bucketsBySpecification": {
          "L-shape 5-seater — cotton": [
            {
              "b": "loose_furn",
              "pct": 100
            }
          ],
          "Sectional 6-seater — microfiber": [
            {
              "b": "loose_furn",
              "pct": 100
            }
          ],
          "3+2 seater — linen": [
            {
              "b": "loose_furn",
              "pct": 100
            }
          ],
          "3+2 — faux leather": [
            {
              "b": "loose_furn",
              "pct": 100
            }
          ]
        }
      },
      {
        "id": "LF02",
        "description": "Dining table + chairs",
        "unit": "lot",
        "baseRate": 55000,
        "rates": null,
        "defaultRate": null,
        "specifications": [
          "6-seater sheesham wood",
          "4-seater teak",
          "8-seater MDF veneer",
          "6-seater metal + glass"
        ],
        "quantityBasis": "1",
        "luxuryUpgrade": null,
        "bucketsBySpecification": {
          "6-seater sheesham wood": [
            {
              "b": "loose_furn",
              "pct": 100
            }
          ],
          "4-seater teak": [
            {
              "b": "loose_furn",
              "pct": 100
            }
          ],
          "8-seater MDF veneer": [
            {
              "b": "loose_furn",
              "pct": 100
            }
          ],
          "6-seater metal + glass": [
            {
              "b": "loose_furn",
              "pct": 100
            }
          ]
        }
      },
      {
        "id": "LF03",
        "description": "Centre / coffee table",
        "unit": "lot",
        "baseRate": 25000,
        "rates": null,
        "defaultRate": null,
        "specifications": [
          "Marble top + metal legs",
          "Glass + wood",
          "Solid wood",
          "Nested tables set"
        ],
        "quantityBasis": "1",
        "luxuryUpgrade": null,
        "bucketsBySpecification": {
          "Marble top + metal legs": [
            {
              "b": "loose_furn",
              "pct": 100
            }
          ],
          "Glass + wood": [
            {
              "b": "loose_furn",
              "pct": 100
            }
          ],
          "Solid wood": [
            {
              "b": "loose_furn",
              "pct": 100
            }
          ],
          "Nested tables set": [
            {
              "b": "loose_furn",
              "pct": 100
            }
          ]
        }
      },
      {
        "id": "LF04",
        "description": "Mattress",
        "unit": "lot",
        "baseRate": 22000,
        "rates": null,
        "defaultRate": null,
        "specifications": [
          "Orthopaedic spring",
          "Memory foam",
          "Latex",
          "Coir + foam"
        ],
        "quantityBasis": "1",
        "luxuryUpgrade": null,
        "bucketsBySpecification": {
          "Orthopaedic spring": [
            {
              "b": "loose_furn",
              "pct": 100
            }
          ],
          "Memory foam": [
            {
              "b": "loose_furn",
              "pct": 100
            }
          ],
          "Latex": [
            {
              "b": "loose_furn",
              "pct": 100
            }
          ],
          "Coir + foam": [
            {
              "b": "loose_furn",
              "pct": 100
            }
          ]
        }
      }
    ]
  }
] as const;
