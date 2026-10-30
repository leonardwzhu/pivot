// College lines of last year's rookies, used to fit the college -> NBA translation: [pts, reb, ast, stl, blk, 3pm, tov, fg%, ft%]
const COLL={
"Cooper Flagg":[19.2,7.5,4.2,1.4,1.4,1.0,2.4,.481,.840],
"Kon Knueppel":[14.4,4.0,2.7,0.9,0.2,2.0,1.6,.479,.914],
"Ace Bailey":[17.6,7.2,1.3,1.0,1.3,1.6,2.0,.460,.692],
"Dylan Harper":[19.4,4.6,4.0,1.4,0.6,1.7,2.8,.484,.750],
"Khaman Maluach":[8.6,6.6,0.5,0.4,1.3,0.1,1.0,.711,.776]
};
// Health multipliers are no longer hand-set: ESPN's projections (blended by backtest) carry injury-return context
const CTX={};
// Ages (Feb 1, 2027) for rookies without NBA games yet
const ROOK_AGE={"Cooper Flagg": 20, "Cameron Boozer": 19, "AJ Dybantsa": 20, "Darryn Peterson": 20, "Caleb Wilson": 20, "Darius Acuff": 20, "Kon Knueppel": 21, "Ace Bailey": 20, "Dylan Harper": 20, "Khaman Maluach": 20, "Keaton Wagler": 20};
// Board teams use ESPN abbreviations; the data uses Basketball Reference's
const TEAM_FIX={SA:"SAS",PHX:"PHO",NO:"NOP",BKN:"BRK",CHA:"CHO"};
