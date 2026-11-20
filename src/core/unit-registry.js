const UNIT_DEFINITIONS = [
  ["V", "volt", "voltage", "V"],
  ["mV", "millivolt", "voltage", "mV"],
  ["uV", "microvolt", "voltage", "µV"],
  ["A", "ampere", "current", "A"],
  ["mA", "milliampere", "current", "mA"],
  ["uA", "microampere", "current", "µA"],
  ["ohm", "ohm", "resistance", "Ω"],
  ["kohm", "kiloohm", "resistance", "kΩ"],
  ["Mohm", "megaohm", "resistance", "MΩ"],
  ["F", "farad", "capacitance", "F"],
  ["mF", "millifarad", "capacitance", "mF"],
  ["uF", "microfarad", "capacitance", "µF"],
  ["nF", "nanofarad", "capacitance", "nF"],
  ["pF", "picofarad", "capacitance", "pF"],
  ["H", "henry", "inductance", "H"],
  ["mH", "millihenry", "inductance", "mH"],
  ["uH", "microhenry", "inductance", "µH"],
  ["Hz", "hertz", "frequency", "Hz"],
  ["kHz", "kilohertz", "frequency", "kHz"],
  ["MHz", "megahertz", "frequency", "MHz"],
  ["degC", "degree Celsius", "temperature", "°C"],
  ["degF", "degree Fahrenheit", "temperature", "°F"],
  ["%", "percent", "ratio", "%"],
  ["1", "dimensionless", "dimensionless", ""],
];

const registry = new Map(
  UNIT_DEFINITIONS.map(([code, name, quantity, symbol]) => [
    code,
    Object.freeze({ code, name, quantity, symbol }),
  ]),
);

export function getUnit(unitCode) {
  return registry.get(unitCode) ?? null;
}

export function isKnownUnit(unitCode) {
  return registry.has(unitCode);
}

export function listUnits() {
  return [...registry.values()];
}

export function getUnitsForQuantity(quantity) {
  return listUnits().filter((unit) => unit.quantity === quantity);
}

/**
 * Unit metadata only. This module deliberately performs no implicit conversion.
 * Unknown unit codes are preserved by callers and are never guessed.
 */
