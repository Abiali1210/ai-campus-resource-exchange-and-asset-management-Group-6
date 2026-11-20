import { describe, expect, it } from "vitest";
import { assetIllustration } from "../src/assetIllustrations";

describe("representative asset illustrations", () => {
  it.each([
    ["CO2 fire extinguisher", "Safety equipment", "extinguisher"],
    ["Fire extinguishers", "Monitors", "extinguisher"],
    ["Dell Latitude laptop", "IT equipment", "laptop"],
    ["Desktop computer", "Computers", "computer"],
    ["HP laser printer", "Electronics", "printer"],
    ["USB keyboard", "Peripherals", "keyboard"],
    ["Wireless mouse", "Peripherals", "mouse"],
    ["Teaching lab workbench", "Furniture", "desk"],
    ["Filing cabinet", "Office furniture", "cabinet"],
    ["Library bookshelves", "Furniture", "bookshelf"],
    ["Engineering textbooks", "Library", "book"],
    ["Optical microscope", "Lab equipment", "microscope"],
    ["Maintenance tool kit", "Equipment", "tools"],
    ["Mobile whiteboard", "Teaching supplies", "whiteboard"],
    ["Delivery trolley", "Facilities", "trolley"],
    ["Ten reusable lab chairs", "Furniture", "chair"],
    ["Epson projector", "Electronics", "projector"],
    ["Synthetic HDMI displays", "Monitors", "monitor"],
    ["Dell 24-inch display", "Office furniture", "monitor"],
    ["Unlabelled resource", "Projectors", "projector"],
    ["Replacement cabinet", "Chairs", "cabinet"],
    ["Research apparatus", "Lab equipment", "generic"],
    ["Stationery notebook", "Office supplies", "generic"],
    ["Tablets for teaching", "Electronics", "generic"],
    ["", "", "generic"],
  ])("%s (%s) uses %s", (name, category, expected) => {
    expect(assetIllustration(name, category)).toBe(expected);
  });
});
