-- Japanese answer grading: for answer_lang 'ja', grading_normalize now removes every space after the
-- punctuation step (every listed whitespace char, incl. the ideographic space U+3000, is already U+0020
-- by then). So "はい、そうです。", "はい そうです" and "はいそうです" normalise to the same string and ja
-- content no longer has to declare spacing/punctuation variants. en/ko/vi are unchanged.
-- Mirror of normalizeAnswer in packages/shared/src/content/grading.ts; both are checked against
-- grading.fixtures.json (supabase/tests/grading.test.sql is generated from it).
-- Body = grading_normalize from 20261014000200_lesson_runs.sql plus the ja branch before the final return.
-- grade_exercise / grading_text call this function, so they pick the change up without being redefined.
-- create or replace keeps the owner and the grants revoked in 20261014000200.

create or replace function public.grading_normalize(p_text text, p_lang text, p_rubric jsonb)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_rubric jsonb := '{"punctuation":"ignore","diacritics":"strict","ko_spacing":"lenient","typo_tolerance":0,"expand_contractions":true}'::jsonb
    || coalesce(p_rubric, '{}'::jsonb);
  v text collate pg_catalog.pg_c_utf8;
  v_punct constant text := '.,!?;:"()[]{}…。、「」『』«»¿¡？！，';
  -- TAB LF VT FF CR, NEL, NBSP, OGHAM SPACE, U+2000-U+200A, LS, PS, NNBSP, MMSP, IDEOGRAPHIC SPACE.
  v_ws constant text := chr(9) || chr(10) || chr(11) || chr(12) || chr(13) || chr(133) || chr(160) || chr(5760)
    || chr(8192) || chr(8193) || chr(8194) || chr(8195) || chr(8196) || chr(8197) || chr(8198) || chr(8199)
    || chr(8200) || chr(8201) || chr(8202) || chr(8232) || chr(8233) || chr(8239) || chr(8287) || chr(12288);
  -- Dropped outright: ZWSP, ZWNJ, ZWJ, WORD JOINER, BOM/ZWNBSP.
  v_zw constant text := chr(8203) || chr(8204) || chr(8205) || chr(8288) || chr(65279);
  -- Word characters as in grading.ts WORD_CHAR ([[:alpha:]] is Unicode Alphabetic under pg_c_utf8).
  v_word constant text := '[[:alpha:]0-9_]';
  -- Longest first, whole words only. 's is never expanded; i'd is ambiguous (had/would) and left alone.
  v_contractions constant text[] := array[
    ['shouldn''t', 'should not'], ['couldn''t', 'could not'], ['wouldn''t', 'would not'],
    ['doesn''t', 'does not'], ['haven''t', 'have not'], ['weren''t', 'were not'],
    ['they''re', 'they are'], ['they''ll', 'they will'], ['they''ve', 'they have'],
    ['can not', 'cannot'], ['you''re', 'you are'], ['aren''t', 'are not'], ['wasn''t', 'was not'],
    ['didn''t', 'did not'], ['hasn''t', 'has not'], ['you''ll', 'you will'], ['you''ve', 'you have'],
    ['we''re', 'we are'], ['isn''t', 'is not'], ['don''t', 'do not'], ['we''ll', 'we will'],
    ['we''ve', 'we have'], ['can''t', 'cannot'], ['won''t', 'will not'],
    ['i''ll', 'i will'], ['i''ve', 'i have'], ['i''m', 'i am']
  ];
  -- Old-style Vietnamese tone placement -> new style, only at the end of a word and never after q
  -- (in "qu" the u is a glide: quý / quỳ are already correct).
  v_vi_tones constant text[] := array[
    ['oà', 'òa'], ['oá', 'óa'], ['oả', 'ỏa'], ['oã', 'õa'], ['oạ', 'ọa'],
    ['oè', 'òe'], ['oé', 'óe'], ['oẻ', 'ỏe'], ['oẽ', 'õe'], ['oẹ', 'ọe'],
    ['uỳ', 'ùy'], ['uý', 'úy'], ['uỷ', 'ủy'], ['uỹ', 'ũy'], ['uỵ', 'ụy']
  ];
  v_pair text[];
begin
  if p_text is null then
    return null;
  end if;
  v := translate(p_text, v_zw, '');
  v := translate(v, v_ws, repeat(' ', char_length(v_ws)));
  v := normalize(v, NFC);
  v := lower(v collate pg_catalog.pg_c_utf8);
  v := translate(v, '’‘`´“”„', repeat(chr(39), 4) || '"""');
  v := btrim(regexp_replace(v collate pg_catalog.pg_c_utf8, ' {2,}', ' ', 'g'), ' ');
  if v_rubric ->> 'punctuation' = 'strict' then
    -- After the collapse above, so "end. " and "end ." both lose the trailing mark.
    v := regexp_replace(v collate pg_catalog.pg_c_utf8, '[.!?…。？！ ]+$', '');
  else
    v := translate(v, v_punct, repeat(' ', char_length(v_punct)));
  end if;
  v := btrim(regexp_replace(v collate pg_catalog.pg_c_utf8, ' {2,}', ' ', 'g'), ' ');

  if p_lang = 'en' and coalesce((v_rubric ->> 'expand_contractions')::boolean, true) then
    foreach v_pair slice 1 in array v_contractions loop
      v := regexp_replace(v collate pg_catalog.pg_c_utf8, '(?<!' || v_word || ')' || v_pair[1] || '(?!' || v_word || ')', v_pair[2], 'g');
    end loop;
  elsif p_lang = 'vi' then
    foreach v_pair slice 1 in array v_vi_tones loop
      v := regexp_replace(v collate pg_catalog.pg_c_utf8, '(?<!q)' || normalize(v_pair[1], NFC) || '(?![[:alpha:]])', normalize(v_pair[2], NFC), 'g');
    end loop;
  elsif p_lang = 'ja' then
    -- Japanese is written without spaces: only U+0020 is left at this point, so this drops them all.
    return replace(v, ' ', '');
  end if;

  return btrim(regexp_replace(v collate pg_catalog.pg_c_utf8, ' {2,}', ' ', 'g'), ' ');
end;
$$;
