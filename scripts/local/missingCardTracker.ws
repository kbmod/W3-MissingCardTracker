struct SCardLocation {
    var entryIdx : string;
    var location, query, cards : array<string>;
}

class CMissingCardTracker {
    private var locations, locationsRemaining : array<SCardLocation>;
    private var cards : array<SCardSourceData>;
    private var randomRemaining : bool;
    private var contents : string;

    public function Init() {
        locations = ExtractLocationData();
        cards = ExtractCardData();
        randomRemaining = RandomRemaining();
        locationsRemaining = FilterLocations();
        contents = GenerateContents();
    }

    private function CSVStringToArrayString(str, delim : string) : array<string> {
        var arr : array<string>;
        var left, right : string;
        var b : bool;

        b = true;
        while (b) {
            if (str == "") break;
            b = StrSplitFirst(str, delim, left, right);
            if (b) {
                arr.PushBack(left);
                str = right;
            } else {
                arr.PushBack(str);
            }
        }

        return arr;
    }

    private function ExtractLocationData() : array<SCardLocation> {
        var locations : array<SCardLocation>;
        var sourceCSV : C2dArray;
        var locationAmount, i : int;

        sourceCSV = LoadCSV("gameplay\globals\mod_missing_card_tracker.csv");

        locationAmount = sourceCSV.GetNumRows();
        locations.Resize(locationAmount);
        for (i = 0; i < locationAmount; i += 1) {
            locations[i].entryIdx = sourceCSV.GetValue("EntryIdx", i);
            locations[i].location = CSVStringToArrayString(sourceCSV.GetValue("Location", i), ",");
            locations[i].query = CSVStringToArrayString(sourceCSV.GetValue("FactsQuery", i), ",");
            locations[i].cards = CSVStringToArrayString(sourceCSV.GetValue("Cards", i), ",");
        }

        return locations;
    }

    private function ExtractCardData() : array<SCardSourceData> {
        var cards : array<SCardSourceData>;
        var card : SCardSourceData;
        var sourceCSV : C2dArray;
        var cardAmount, i : int;

        sourceCSV = LoadCSV("gameplay\globals\card_sources.csv");

        cardAmount = sourceCSV.GetNumRows();
        for (i = 0; i < cardAmount; i += 1) {
            card.cardName = sourceCSV.GetValueAsName("CardName", i);
            // Source tables can retain removed items (e.g. Poor Infantry 2/3).
            // Query the active definitions so restored cards still work with mods.
            if (!theGame.GetDefinitionsManager().ItemHasTag(card.cardName, 'GwintCard')) continue;
            card.originArea = sourceCSV.GetValue("OriginArea", i);
            cards.PushBack(card);
        }

        return cards;
    }

    private function RandomRemaining() : bool {
        var random : bool;
        var i : int;

        for (i = 0; i < cards.Size(); i += 1) {
            if (cards[i].originArea != "Random") continue;

            if (thePlayer.inv.GetItemQuantityByName(cards[i].cardName) == 0) {
                random = true;
                break;
            }
        }

        return random;
    }

    private function FilterLocations() : array<SCardLocation> {
        var locationsRemaining : array<SCardLocation>;
        var i, j, k, amount : int;
        var query : array<string>;
        var card : name;

        // loop through locations
        for (i = 0; i < locations.Size(); i += 1) {
            // handle locations with random cards
            query = locations[i].query;
            if (randomRemaining && query.Size() > 0) {
                for (j = 0; j < query.Size(); j += 1) {
                    // Multiple facts identify alternative versions of one opponent.
                    // Claiming a card from either version completes this location.
                    if (FactsQuerySum(query[j]) > 0) {
                        break;
                    }
                }
                if (j == query.Size()) {
                    locationsRemaining.PushBack(locations[i]);
                }
            } else {
                // loop through all cards
                for (k = 0; k < cards.Size(); k += 1) {
                    card = cards[k].cardName;

                    switch (NameToString(card)) {
                        case "gwint_card_dummy":
                        case "gwint_card_horn":
                        case "gwint_card_scorch":
                        case "gwint_card_mrmirror_foglet":
                            amount = 3;
                            break;
                        default:
                            amount = 1;
                            break;
                    }

                    // normalize gog variants
                    if (card == 'gwint_card_gog_ciri') {
                        card = 'gwint_card_ciri';
                    } else if (card == 'gwint_card_gog_geralt') {
                        card = 'gwint_card_geralt';
                    }

                    // ownership check
                    if (thePlayer.inv.GetItemQuantityByName(card) >= amount) {
                        continue;
                    } else if (card == 'gwint_card_ciri') {
                        if (thePlayer.inv.GetItemQuantityByName('gwint_card_gog_ciri') > 0)
                            continue;
                    } else if (card == 'gwint_card_geralt') {
                        if (thePlayer.inv.GetItemQuantityByName('gwint_card_gog_geralt') > 0)
                            continue;
                    }

                    // if list of cards (mod_missing_card_tracker.csv) contains card name (card_sources.csv)
                    if (locations[i].cards.Contains(NameToString(card))) {
                        locationsRemaining.PushBack(locations[i]);
                        break;
                    }
                }
            }
        }

        return locationsRemaining;
    }

    private function GenerateContents() : string {
        var contents, item : string;
        var i, j : int;
        var l : SCardLocation;

        contents = GetLocStringByKeyExt("gwent_almanac_text") + "<br>";

        if (locationsRemaining.Size() == 0) {
            contents += GetLocStringByKeyExt("gwent_almanac_completed_text");
        } else {
            for (i = 0; i < locationsRemaining.Size(); i += 1) {
                l = locationsRemaining[i];

                item = "- ";

                item += GetLocStringById(StringToInt(l.location[0]));
                for (j = 1; j < l.location.Size(); j += 1) {
                    item += ", " + GetLocStringById(StringToInt(l.location[j]));
                }

                if (l.cards.Contains("gwint_card_dummy")) item += " <font color='#d20f39'>*</font>";
                if (l.cards.Contains("gwint_card_horn")) item += " <font color='#df8e1d'>*</font>";
                if (l.cards.Contains("gwint_card_scorch")) item += " <font color='#40a02b'>*</font>";
                if (l.cards.Contains("gwint_card_mrmirror_foglet")) item += " <font color='#1e66f5'>*</font>";

                item += "<br>";

                contents += item;
            }

            if (thePlayer.inv.GetItemQuantityByName('gwint_card_dummy') < 3) {
                contents += "<br><font color='#d20f39'>*</font> " + GetLocStringById(397235) + ", " + GetLocStringById(1083564) + " " + thePlayer.inv.GetItemQuantityByName('gwint_card_dummy') + "/3";
            }
            if (thePlayer.inv.GetItemQuantityByName('gwint_card_horn') < 3) {
                contents += "<br><font color='#df8e1d'>*</font> " + GetLocStringById(397235) + ", " + GetLocStringById(1043645) + " " + thePlayer.inv.GetItemQuantityByName('gwint_card_horn') + "/3";
            }
            if (thePlayer.inv.GetItemQuantityByName('gwint_card_scorch') < 3) {
                contents += "<br><font color='#40a02b'>*</font> " + GetLocStringById(397235) + ", " + GetLocStringById(1043646) + " " + thePlayer.inv.GetItemQuantityByName('gwint_card_scorch') + "/3";
            }
            if (thePlayer.inv.GetItemQuantityByName('gwint_card_mrmirror_foglet') < 3) {
                contents += "<br><font color='#1e66f5'>*</font> " + GetLocStringById(397235) + ", " + GetLocStringById(1134841) + " " + thePlayer.inv.GetItemQuantityByName('gwint_card_mrmirror_foglet') + "/3";
            }
        }

        return contents;
    }

    public function GetContents() : string { return contents; }
}

@replaceMethod(CInventoryComponent) function GetGwentAlmanacContents() : string {
    var contents : string;
    var mct : CMissingCardTracker;

    mct = new CMissingCardTracker in this;
    mct.Init();
    contents = mct.GetContents();

    return contents;
}
