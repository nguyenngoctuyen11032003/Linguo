-- German answer grading. For answer_lang 'de':
--  * grading_normalize folds ae-oe-ue-ss digraph equivalents on every string (learner response, accepted
--    answers, known_wrong): a-umlaut -> ae, o-umlaut -> oe, u-umlaut -> ue, eszett -> ss. This runs after NFC and
--    lowercasing, so capital umlauts and the capital eszett (U+1E9E) are folded as well. So typing
--    fuer / Strasse / schoen is judged correct against the standard spellings. Spaces are kept and
--    no contractions are expanded.
--  * grading_text adds an 'almost' step for rubric diacritics = 'lenient': when the umlaut dots are simply
--    dropped (fur for fuer-umlaut, schon for schoen-umlaut) the answer is 'almost' with the error tag
--    'missing_diacritics'. It compares the response and each accepted answer with a/o/u in place of
--    the umlauts, so it never turns a different word into 'correct' and never forgives a missing ending.
--    There is no typo tolerance for German (it is English-only and would hide adjective-ending errors).
-- en/ko/vi/ja behave exactly as before. Mirror of normalizeAnswer / gradeText in
-- packages/shared/src/content/grading.ts; both are checked against grading.fixtures.json
-- (supabase/tests/grading.test.sql is generated from it).
-- Bodies = grading_normalize from 20261018140000_ja_grading_whitespace.sql and grading_text from
-- 20261014000200_lesson_runs.sql, plus the de branches. grade_exercise calls grading_text, so it picks
-- the change up without being redefined. create or replace keeps the owner and the grants revoked in
-- 20261014000200.

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
  elsif p_lang = 'de' then
    -- German: a-umlaut, o-umlaut, u-umlaut, eszett -> ae, oe, ue, ss (v is NFC and lowercase here, so capitals are already folded
    -- to lowercase; the capital eszett U+1E9E lowercases to the eszett). Spaces are kept.
    v := replace(replace(replace(replace(v, chr(228), 'ae'), chr(246), 'oe'), chr(252), 'ue'), chr(223), 'ss');
  elsif p_lang = 'ja' then
    -- Japanese is written without spaces: only U+0020 is left at this point, so this drops them all.
    return replace(v, ' ', '');
  end if;

  return btrim(regexp_replace(v collate pg_catalog.pg_c_utf8, ' {2,}', ' ', 'g'), ' ');
end;
$$;

-- Grades one text answer against its accepted variants (plan steps 4.1–4.8).
-- Returns {verdict, error_tags, feedback_vi}.
create or replace function public.grading_text(p_text text, p_accepted jsonb, p_known_wrong jsonb, p_lang text, p_rubric jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_rubric jsonb := '{"punctuation":"ignore","diacritics":"strict","ko_spacing":"lenient","typo_tolerance":0,"expand_contractions":true}'::jsonb
    || coalesce(p_rubric, '{}'::jsonb);
  v_r text;
  v_accepted text[];
  v_a text;
  v_kw jsonb;
  v_rt text[];
  v_at text[];
  v_r_noart text[];
  v_diff integer;
  v_di integer;
  v_x text;
  v_y text;
  v_typo_excluded constant text[] := array['a', 'an', 'the', 'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being'];
  -- [after a final consonant (batchim), after a vowel, 'y' if ㄹ batchim takes the vowel form].
  v_pairs constant text[] := array[
    ['이에요', '예요', 'n'], ['으로', '로', 'y'], ['은', '는', 'n'], ['이', '가', 'n'], ['을', '를', 'n'], ['과', '와', 'n']
  ];
  v_pair text[];
  v_from text;
  v_to text;
  v_pos integer;
  v_idx integer;
  v_end integer;
  v_prev integer;
  v_jong integer;
  v_r_ns text;
  v_r_drop text;
  -- German umlaut letters (a/o/u with diaeresis, lower and upper case) and what they become with the dots dropped.
  v_de_dotted constant text := chr(228) || chr(246) || chr(252) || chr(196) || chr(214) || chr(220);
begin
  v_r := coalesce(public.grading_normalize(p_text, p_lang, v_rubric), '');
  if v_r = '' then
    return jsonb_build_object('verdict', 'incorrect', 'error_tags', '[]'::jsonb, 'feedback_vi', 'null'::jsonb);
  end if;
  select coalesce(array_agg(public.grading_normalize(t.a, p_lang, v_rubric) order by t.o), '{}'::text[])
    into v_accepted
    from jsonb_array_elements_text(case when jsonb_typeof(p_accepted) = 'array' then p_accepted else '[]'::jsonb end) with ordinality as t(a, o);

  -- 1. exact match after normalization
  if v_r = any(v_accepted) then
    return jsonb_build_object('verdict', 'correct', 'error_tags', '[]'::jsonb, 'feedback_vi', 'null'::jsonb);
  end if;

  -- 2. known wrong answers
  for v_kw in
    select k.value from jsonb_array_elements(case when jsonb_typeof(p_known_wrong) = 'array' then p_known_wrong else '[]'::jsonb end) with ordinality as k(value, o) order by k.o
  loop
    if v_r = public.grading_normalize(v_kw ->> 'answer', p_lang, v_rubric) then
      return jsonb_build_object('verdict', 'incorrect', 'error_tags', jsonb_build_array(v_kw -> 'error_tag'), 'feedback_vi', coalesce(v_kw -> 'feedback_vi', 'null'::jsonb));
    end if;
  end loop;

  if p_lang = 'en' then
    -- 3. only articles differ
    v_r_noart := array(select t.w from unnest(string_to_array(v_r, ' ')) with ordinality as t(w, o) where t.w not in ('a', 'an', 'the') order by t.o);
    foreach v_a in array v_accepted loop
      if array(select t.w from unnest(string_to_array(v_a, ' ')) with ordinality as t(w, o) where t.w not in ('a', 'an', 'the') order by t.o) = v_r_noart then
        return jsonb_build_object('verdict', 'incorrect', 'error_tags', '["article"]'::jsonb, 'feedback_vi', 'null'::jsonb);
      end if;
    end loop;

    -- 4. exactly one long token off by one edit
    if (v_rubric ->> 'typo_tolerance') = '1' then
      v_rt := string_to_array(v_r, ' ');
      foreach v_a in array v_accepted loop
        v_at := string_to_array(v_a, ' ');
        if cardinality(v_at) = cardinality(v_rt) then
          v_diff := 0;
          v_di := 0;
          for v_i in 1 .. cardinality(v_rt) loop
            if v_rt[v_i] <> v_at[v_i] then
              v_diff := v_diff + 1;
              v_di := v_i;
            end if;
          end loop;
          v_x := v_rt[v_di];
          v_y := v_at[v_di];
          -- extensions.levenshtein raises above 255 chars, so it is only reached inside this guard
          -- (a nested IF, since AND operands have no guaranteed evaluation order).
          if v_diff = 1
             and char_length(v_x) between 5 and 255 and char_length(v_y) between 5 and 255
             and abs(char_length(v_x) - char_length(v_y)) <= 1
             and v_x <> all (v_typo_excluded) and v_y <> all (v_typo_excluded) then
            if extensions.levenshtein(v_x, v_y) = 1 then
              return jsonb_build_object('verdict', 'almost', 'error_tags', '["typo"]'::jsonb, 'feedback_vi', 'null'::jsonb);
            end if;
          end if;
        end if;
      end loop;
    end if;
  end if;

  if p_lang = 'ko' then
    v_r_ns := replace(v_r, ' ', '');
    -- 5. spacing only
    if v_rubric ->> 'ko_spacing' = 'lenient' then
      foreach v_a in array v_accepted loop
        if replace(v_a, ' ', '') = v_r_ns then
          return jsonb_build_object('verdict', 'almost', 'error_tags', '["spacing"]'::jsonb, 'feedback_vi', 'null'::jsonb);
        end if;
      end loop;
    end if;
    -- 6. a word-final particle that is the right allomorph for the Hangul syllable before it,
    --    swapped for the other member of its pair
    foreach v_a in array v_accepted loop
      foreach v_pair slice 1 in array v_pairs loop
        for v_d in 1 .. 2 loop
          v_from := v_pair[v_d];
          v_to := v_pair[3 - v_d];
          v_pos := 0;
          loop
            v_idx := strpos(substr(v_a, v_pos + 1), v_from);
            exit when v_idx = 0;
            v_pos := v_pos + v_idx;
            v_end := v_pos + char_length(v_from);
            if v_pos > 1 and (v_end > char_length(v_a) or substr(v_a, v_end, 1) = ' ') then
              v_prev := ascii(substr(v_a, v_pos - 1, 1));
              if v_prev between 44032 and 55203 then
                v_jong := (v_prev - 44032) % 28;
                -- v_d = 1: v_from is the after-batchim form; v_d = 2: the after-vowel form.
                if (v_d = 2) = (v_jong = 0 or (v_pair[3] = 'y' and v_jong = 8))
                   and replace(substr(v_a, 1, v_pos - 1) || v_to || substr(v_a, v_end), ' ', '') = v_r_ns then
                  return jsonb_build_object('verdict', 'incorrect', 'error_tags', '["particle_allomorph"]'::jsonb, 'feedback_vi', 'null'::jsonb);
                end if;
              end if;
            end if;
          end loop;
        end loop;
      end loop;
    end loop;
  end if;

  -- 7. Vietnamese without diacritics
  if p_lang = 'vi' and v_rubric ->> 'diacritics' = 'lenient' then
    foreach v_a in array v_accepted loop
      if public.grading_strip_diacritics(v_a) = public.grading_strip_diacritics(v_r) then
        return jsonb_build_object('verdict', 'almost', 'error_tags', '["missing_diacritics"]'::jsonb, 'feedback_vi', 'null'::jsonb);
      end if;
    end loop;
  end if;

  -- 8. German typed without the umlaut dots (fur for fuer-umlaut). Response and accepted answers are compared
  --    with a/o/u for the umlauts (eszett still folds to ss), so a different word is never 'correct'.
  if p_lang = 'de' and v_rubric ->> 'diacritics' = 'lenient' then
    v_r_drop := public.grading_normalize(translate(normalize(p_text, NFC), v_de_dotted, 'aouAOU'), p_lang, v_rubric);
    if exists (
      select 1
        from jsonb_array_elements_text(case when jsonb_typeof(p_accepted) = 'array' then p_accepted else '[]'::jsonb end) as t(a)
       where public.grading_normalize(translate(normalize(t.a, NFC), v_de_dotted, 'aouAOU'), p_lang, v_rubric) = v_r_drop
    ) then
      return jsonb_build_object('verdict', 'almost', 'error_tags', '["missing_diacritics"]'::jsonb, 'feedback_vi', 'null'::jsonb);
    end if;
  end if;

  return jsonb_build_object('verdict', 'incorrect', 'error_tags', '[]'::jsonb, 'feedback_vi', 'null'::jsonb);
end;
$$;
