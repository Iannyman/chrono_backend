-- ============================================================================
-- DC_chronos_sp_get_sessions_data_detailed
-- Returns session data with three grouping modes based on payload parameters.
--
-- Payload: [{"from":"YYYY-MM-DD","to":"YYYY-MM-DD","line_id":"","person_id":""}]
--
-- Modes:
--   line_id empty + person_id provided  -> group by person per day
--   person_id empty + line_id provided -> group by line per day
--   both empty                         -> flat array
--
-- Output: {"success":1,"data":[...]}
--
-- IMPORTANT: Adjust table/column names below to match your actual schema.
-- Look for comments marked with [VERIFY] for placeholders.
-- ============================================================================

CREATE OR ALTER PROCEDURE dbo.DC_chronos_sp_get_sessions_data_detailed
    @payload NVARCHAR(MAX),
    @result  NVARCHAR(MAX) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    -- 1. Parse payload
    DECLARE @from DATE, @to DATE, @line_id VARCHAR(50), @person_id VARCHAR(50);

    SELECT
        @from      = TRY_CONVERT(DATE, [from]),
        @to        = TRY_CONVERT(DATE, [to]),
        @line_id   = ISNULL(NULLIF(LTRIM(RTRIM(line_id)),   ''), NULL),
        @person_id = ISNULL(NULLIF(LTRIM(RTRIM(person_id)), ''), NULL)
    FROM OPENJSON(@payload)
    WITH (
        [from]     NVARCHAR(20)  '$.from',
        [to]       NVARCHAR(20)  '$.to',
        line_id    NVARCHAR(50)  '$.line_id',
        person_id  NVARCHAR(50)  '$.person_id'
    );

    -- Validate date range
    IF @from IS NULL OR @to IS NULL OR @from > @to
    BEGIN
        SET @result = N'{"success":0,"message":"Invalid date range. Provide valid from/to dates."}';
        RETURN;
    END

    -- 2. Generate date series (recursive CTE with unlimited recursion)
    DECLARE @dates TABLE (reporting_day DATE);
    WITH date_cte AS (
        SELECT @from AS reporting_day
        UNION ALL
        SELECT DATEADD(DAY, 1, reporting_day)
        FROM date_cte
        WHERE reporting_day < @to
    )
    INSERT INTO @dates (reporting_day)
    SELECT reporting_day FROM date_cte
    OPTION (MAXRECURSION 0);

    -- [VERIFY] Table name and column names below must match your actual schema.
    -- The example assumes a view or table called dbo.v_chronos_sessions that
    -- joins person info, line info, and session timestamps into a flat structure.
    -- Adjust as needed.

    -- 3. Mode A: group by person (line_id is null, person_id provided)
    IF @line_id IS NULL AND @person_id IS NOT NULL
    BEGIN
        -- [VERIFY] Adjust table/column names
        SELECT @result = (
            SELECT
                CONVERT(VARCHAR(10), d.reporting_day, 120) AS [reporting_day],
                s.person_id,
                s.person_last_name,
                s.person_first_name,
                ISNULL(
                    (
                        SELECT
                            s2.line_id,
                            s2.line_name,
                            CONVERT(VARCHAR(19), s2.login_timestamp,  126) AS [login_timestamp],
                            CONVERT(VARCHAR(19), s2.logout_timestamp, 126) AS [logout_timestamp],
                            s2.session_minutes
                        FROM dbo.DC_chronos_sessions s2                    -- [VERIFY] table name
                        WHERE s2.person_id = @person_id
                          AND CAST(s2.login_timestamp AS DATE) = d.reporting_day
                        ORDER BY s2.login_timestamp
                        FOR JSON PATH
                    ),
                    '[]'
                ) AS [sessions]
            FROM @dates d
            CROSS JOIN (
                SELECT TOP 1
                    TRY_CAST(@person_id AS INT) AS person_id,
                    p.person_last_name,                              -- [VERIFY] column
                    p.person_first_name                              -- [VERIFY] column
                FROM dbo.DC_chronos_sessions p                        -- [VERIFY] table name
                WHERE TRY_CAST(p.person_id AS VARCHAR(50)) = @person_id
            ) s
            ORDER BY d.reporting_day DESC
            FOR JSON PATH
        );
    END

    -- 4. Mode B: group by line (person_id is null, line_id provided)
    ELSE IF @person_id IS NULL AND @line_id IS NOT NULL
    BEGIN
        -- [VERIFY] Adjust table/column names
        SELECT @result = (
            SELECT
                CONVERT(VARCHAR(10), d.reporting_day, 120) AS [reporting_day],
                TRY_CAST(@line_id AS INT) AS [line_id],
                l.line_name,
                ISNULL(
                    (
                        SELECT
                            s2.person_id,
                            s2.person_last_name,
                            s2.person_first_name,
                            CONVERT(VARCHAR(19), s2.login_timestamp,  126) AS [login_timestamp],
                            CONVERT(VARCHAR(19), s2.logout_timestamp, 126) AS [logout_timestamp],
                            s2.session_minutes
                        FROM dbo.DC_chronos_sessions s2                    -- [VERIFY] table name
                        WHERE TRY_CAST(s2.line_id AS VARCHAR(50)) = @line_id
                          AND CAST(s2.login_timestamp AS DATE) = d.reporting_day
                        ORDER BY s2.login_timestamp
                        FOR JSON PATH
                    ),
                    '[]'
                ) AS [sessions]
            FROM @dates d
            CROSS JOIN (
                SELECT TOP 1
                    line_name                                         -- [VERIFY] column
                FROM dbo.DC_chronos_sessions                          -- [VERIFY] table name
                WHERE TRY_CAST(line_id AS VARCHAR(50)) = @line_id
            ) l
            ORDER BY d.reporting_day DESC
            FOR JSON PATH
        );
    END

    -- 5. Mode C: flat array (both empty)
    ELSE IF @line_id IS NULL AND @person_id IS NULL
    BEGIN
        -- [VERIFY] Adjust table/column names
        SELECT @result = (
            SELECT
                CONVERT(VARCHAR(10), d.reporting_day, 120) AS [reporting_day],
                s.person_id,
                s.person_last_name,
                s.person_first_name,
                s.line_id,
                s.line_name,
                CONVERT(VARCHAR(19), s.login_timestamp,  126) AS [login_timestamp],
                CONVERT(VARCHAR(19), s.logout_timestamp, 126) AS [logout_timestamp],
                s.session_minutes
            FROM @dates d
            LEFT JOIN dbo.DC_chronos_sessions s                      -- [VERIFY] table name
                ON CAST(s.login_timestamp AS DATE) = d.reporting_day
            ORDER BY d.reporting_day DESC, s.login_timestamp
            FOR JSON PATH
        );
    END
    ELSE
    BEGIN
        -- Both provided — unsupported combo
        SET @result = N'{"success":0,"message":"Provide either line_id or person_id, not both, or leave both empty for flat results."}';
        RETURN;
    END

    -- 6. Wrap in standard response envelope
    IF @result IS NULL SET @result = N'[]';
    SET @result = JSON_MODIFY(
        JSON_MODIFY(N'{}', '$.success', 1),
        '$.data', JSON_QUERY(@result)
    );
END;
GO
