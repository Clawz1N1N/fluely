/** Bind physical keys consistently across English/Ukrainian/Russian layouts. */
export function shortcutMainKey(event:{key:string;code:string}):string{
  if(/^Key[A-Z]$/.test(event.code))return event.code.slice(3).toLowerCase();
  if(/^Digit[0-9]$/.test(event.code))return event.code.slice(5);
  const punctuation:Record<string,string>={Backslash:'backslash',BracketLeft:'bracketleft',BracketRight:'bracketright',Semicolon:'semicolon',Quote:'quote',Backquote:'grave',Slash:'slash',Comma:'comma',Period:'period',Minus:'minus',Equal:'equal'};
  return punctuation[event.code]??event.key.toLowerCase();
}
